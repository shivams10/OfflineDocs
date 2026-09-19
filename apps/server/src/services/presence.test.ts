import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { PRESENCE_TTL_SECONDS } from "../config/env.js";
import {
  clearOwnDraft,
  getOwnDraft,
  listPresent,
  recordHeartbeat,
  sweepStalePresence,
} from "./presence.js";

const BODY_FIELD = "body";

function encodeText(text: string): string {
  const doc = new Y.Doc();
  doc.getText(BODY_FIELD).insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

function textFrom(update: string): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(update, "base64"));
  return doc.getText(BODY_FIELD).toString();
}

async function makeUser(tag: string) {
  return prisma.user.create({
    data: {
      email: `presence-${tag}-${randomUUID()}@example.test`,
      googleId: `presence-${tag}-${randomUUID()}`,
      name: `Presence ${tag}`,
    },
  });
}

/** Backdates a presence row to simulate a heartbeat that stopped landing. */
async function ageHeartbeat(docId: string, userId: string, secondsAgo: number) {
  await prisma.docPresence.update({
    where: { docId_userId: { docId, userId } },
    data: { lastSeenAt: new Date(Date.now() - secondsAgo * 1000) },
  });
}

describe("presence — a TTL, not a connection", () => {
  let ownerId: string;
  let viewerId: string;
  let strangerId: string;
  let docId: string;

  beforeAll(async () => {
    const [owner, viewer, stranger] = await Promise.all([
      makeUser("owner"),
      makeUser("viewer"),
      makeUser("stranger"),
    ]);
    ownerId = owner.id;
    viewerId = viewer.id;
    strangerId = stranger.id;

    const doc = await prisma.doc.create({
      data: {
        title: "Presence fixture",
        ownerId,
        collaborators: {
          create: [
            { userId: ownerId, role: "owner" },
            { userId: viewerId, role: "viewer" },
          ],
        },
      },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [ownerId, viewerId, strangerId] } } })
      .catch(() => {});
  });

  beforeEach(async () => {
    await prisma.docPresence.deleteMany({ where: { docId } });
    await prisma.docDraft.deleteMany({ where: { docId } });
  });

  it("counts a fresh heartbeat as present and drops one older than the TTL", async () => {
    await recordHeartbeat(docId, ownerId);
    await recordHeartbeat(docId, viewerId);

    expect((await listPresent(docId)).map((row) => row.user.id).sort()).toEqual(
      [ownerId, viewerId].sort(),
    );

    // No "leaving" signal exists by design — a closed tab simply stops beating,
    // so ageing the row past the TTL is exactly what a crashed browser looks like.
    await ageHeartbeat(docId, viewerId, PRESENCE_TTL_SECONDS + 5);

    const present = await listPresent(docId);
    expect(present.map((row) => row.user.id)).toEqual([ownerId]);
  });

  it("includes viewers, who are present without ever having a draft", async () => {
    await recordHeartbeat(docId, viewerId);

    const present = await listPresent(docId);
    expect(present).toHaveLength(1);
    expect(present[0]!.role).toBe("viewer");
    expect(await getOwnDraft(docId, viewerId)).toBeNull();
  });

  it("drops someone whose access was revoked, even while their row is still fresh", async () => {
    await recordHeartbeat(docId, viewerId);
    expect(await listPresent(docId)).toHaveLength(1);

    // Presence rows key off User, not DocCollaborator, so removing access leaves
    // the row behind. Role is read from the ACL at list time precisely so a
    // removed collaborator cannot linger in everyone else's chips.
    await prisma.docCollaborator.delete({
      where: { docId_userId: { docId, userId: viewerId } },
    });

    expect(await listPresent(docId)).toHaveLength(0);

    await prisma.docCollaborator.create({
      data: { docId, userId: viewerId, role: "viewer" },
    });
  });

  it("sweeps rows far past the TTL without touching live ones", async () => {
    await recordHeartbeat(docId, ownerId);
    await recordHeartbeat(docId, viewerId);
    await ageHeartbeat(docId, viewerId, 2 * 60 * 60);

    await sweepStalePresence();

    const rows = await prisma.docPresence.findMany({ where: { docId } });
    expect(rows.map((row) => row.userId)).toEqual([ownerId]);
  });
});

describe("draft backup — private, per-user, and never the canonical document", () => {
  let ownerId: string;
  let otherId: string;
  let docId: string;

  beforeAll(async () => {
    const [owner, other] = await Promise.all([
      makeUser("draft-owner"),
      makeUser("draft-other"),
    ]);
    ownerId = owner.id;
    otherId = other.id;

    const doc = await prisma.doc.create({
      data: {
        title: "Draft fixture",
        ownerId,
        collaborators: {
          create: [
            { userId: ownerId, role: "owner" },
            { userId: otherId, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [ownerId, otherId] } } })
      .catch(() => {});
  });

  beforeEach(async () => {
    // Presence too, not just drafts: every heartbeat writes both, so a case that
    // asserts on who is present would otherwise inherit the previous one's rows.
    await prisma.docDraft.deleteMany({ where: { docId } });
    await prisma.docPresence.deleteMany({ where: { docId } });
  });

  it("round-trips a backup and replaces it on the next heartbeat", async () => {
    await recordHeartbeat(docId, ownerId, encodeText("first pass"));
    expect(textFrom((await getOwnDraft(docId, ownerId))!.update)).toBe("first pass");

    await recordHeartbeat(docId, ownerId, encodeText("second pass"));
    expect(textFrom((await getOwnDraft(docId, ownerId))!.update)).toBe("second pass");

    // One row per (doc, user): a backup is the latest whole state, not an
    // accumulating log that a restore would have to replay.
    const rows = await prisma.docDraft.findMany({ where: { docId } });
    expect(rows).toHaveLength(1);
  });

  it("never leaks one collaborator's unsaved draft to another", async () => {
    await recordHeartbeat(docId, ownerId, encodeText("owner's private words"));

    expect(await getOwnDraft(docId, otherId)).toBeNull();
  });

  it("leaves the canonical snapshot untouched — a backup is not a save", async () => {
    await recordHeartbeat(docId, ownerId, encodeText("only a draft"));

    const doc = await prisma.doc.findUnique({
      where: { id: docId },
      select: { snapshot: true },
    });
    expect(doc!.snapshot).toBeNull();
  });

  it("clears only the caller's backup, and tolerates there being none", async () => {
    await recordHeartbeat(docId, ownerId, encodeText("owner draft"));
    await recordHeartbeat(docId, otherId, encodeText("other draft"));

    await clearOwnDraft(docId, ownerId);

    expect(await getOwnDraft(docId, ownerId)).toBeNull();
    expect(await getOwnDraft(docId, otherId)).not.toBeNull();

    // Saving without ever having had a backup written is ordinary, not an error.
    await expect(clearOwnDraft(docId, ownerId)).resolves.toBeUndefined();
  });

  it("records presence even when no draft is sent", async () => {
    const backedUpAt = await recordHeartbeat(docId, ownerId);

    expect(backedUpAt).toBeNull();
    expect(await getOwnDraft(docId, ownerId)).toBeNull();
    expect((await listPresent(docId)).map((row) => row.user.id)).toEqual([ownerId]);
  });
});
