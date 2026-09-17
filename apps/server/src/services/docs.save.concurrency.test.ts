import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { getDocById, saveDoc } from "./docs.js";

const BODY_FIELD = "body";

/**
 * Two editors saving the same document at the same moment must both land. Without a
 * lock around read → merge → write, both saves merge into the same starting snapshot
 * and the later write discards the earlier one — while that editor's client has
 * already marked its changes saved and will never resend them.
 *
 * Repeated over several fresh documents because a single attempt only loses data
 * when both reads happen before either write.
 */
const ROUNDS = 10;
const RACE_TIMEOUT_MS = 30_000;

function encode(update: Uint8Array): string {
  return Buffer.from(update).toString("base64");
}

function textFromSnapshot(snapshot: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, snapshot);
  return doc.getText(BODY_FIELD).toString();
}

/** A client that opened the document at `base` and appended `text` — its update is a
 *  delta against `base`, exactly as the editor's encodeUpdate() would send. */
function editFrom(base: Uint8Array, text: string): string {
  const client = new Y.Doc();
  Y.applyUpdate(client, base);
  const baseVector = Y.encodeStateVector(client);

  const body = client.getText(BODY_FIELD);
  body.insert(body.length, text);

  return encode(Y.encodeStateAsUpdate(client, baseVector));
}

describe("saveDoc — concurrent saves", () => {
  let userId: string;
  const docIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `save-race-${randomUUID()}@example.test`,
        googleId: `save-race-${randomUUID()}`,
        name: "Save race user",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.doc.deleteMany({ where: { id: { in: docIds } } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it(
    "keeps both editors' changes when two saves land at once",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const { id: docId } = await prisma.doc.create({
          data: {
            title: "Save race fixture",
            ownerId: userId,
            collaborators: { create: { userId, role: "owner" } },
          },
        });
        docIds.push(docId);

        const seed = new Y.Doc();
        seed.getText(BODY_FIELD).insert(0, "base");
        await saveDoc(docId, encode(Y.encodeStateAsUpdate(seed)));

        const stored = await getDocById(docId);
        const base = stored!.snapshot!;

        await Promise.all([
          saveDoc(docId, editFrom(base, " alpha")),
          saveDoc(docId, editFrom(base, " beta")),
        ]);

        const merged = textFromSnapshot((await getDocById(docId))!.snapshot!);
        expect(merged).toContain("alpha");
        expect(merged).toContain("beta");
      }
    },
    RACE_TIMEOUT_MS,
  );
});
