import { randomUUID } from "node:crypto";
import request from "supertest";
import * as Y from "yjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { prisma } from "../db/client.js";
import { signAccessToken } from "../lib/jwt.js";
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE } from "../lib/cookies.js";

const CSRF_VALUE = "presence-route-csrf";

/** Mirrors how every other route suite here presents a session. */
function withSession(req: request.Test, token: string): request.Test {
  return req
    .set("Cookie", [
      `${ACCESS_TOKEN_COOKIE}=${token}`,
      `${CSRF_COOKIE}=${CSRF_VALUE}`,
    ])
    .set("X-CSRF-Token", CSRF_VALUE);
}

function encodeText(text: string): string {
  const doc = new Y.Doc();
  doc.getText("body").insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `presence-route-${tag}-${randomUUID()}@example.test`,
      googleId: `presence-route-${tag}-${randomUUID()}`,
      name: `Route ${tag}`,
    },
  });
  return {
    id: user.id,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

describe("presence + draft routes — access control", () => {
  let owner: { id: string; token: string };
  let editor: { id: string; token: string };
  let viewer: { id: string; token: string };
  let stranger: { id: string; token: string };
  let docId: string;

  beforeAll(async () => {
    [owner, editor, viewer, stranger] = await Promise.all([
      makeUser("owner"),
      makeUser("editor"),
      makeUser("viewer"),
      makeUser("stranger"),
    ]);

    const doc = await prisma.doc.create({
      data: {
        title: "Presence route fixture",
        ownerId: owner.id,
        collaborators: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: editor.id, role: "editor" },
            { userId: viewer.id, role: "viewer" },
          ],
        },
      },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({
        where: { id: { in: [owner.id, editor.id, viewer.id, stranger.id] } },
      })
      .catch(() => {});
  });

  beforeEach(async () => {
    await prisma.docPresence.deleteMany({ where: { docId } });
    await prisma.docDraft.deleteMany({ where: { docId } });
  });

  it("lets a viewer heartbeat, because presence is about attention not write access", async () => {
    const res = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      viewer.token,
    ).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ backedUpAt: null });
  });

  it("refuses a viewer trying to back up a draft they could never save", async () => {
    const res = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      viewer.token,
    ).send({ update: encodeText("not mine to write") });

    expect(res.status).toBe(403);
    expect(await prisma.docDraft.count({ where: { docId } })).toBe(0);
  });

  it("accepts an editor's backup and hands it back only to them", async () => {
    const update = encodeText("editor's unsaved words");

    const post = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      editor.token,
    ).send({ update });
    expect(post.status).toBe(200);
    expect(post.body.backedUpAt).toEqual(expect.any(String));

    const mine = await withSession(
      request(app).get(`/docs/${docId}/draft`),
      editor.token,
    );
    expect(mine.body.draft.update).toBe(update);

    // The owner outranks the editor and still cannot read their draft — this is
    // keyed per user, not gated by role.
    const theirs = await withSession(
      request(app).get(`/docs/${docId}/draft`),
      owner.token,
    );
    expect(theirs.body.draft).toBeNull();
  });

  it("returns 404 to a non-collaborator on every presence route", async () => {
    const heartbeat = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      stranger.token,
    ).send({});
    const presence = await withSession(
      request(app).get(`/docs/${docId}/presence`),
      stranger.token,
    );
    const draft = await withSession(
      request(app).get(`/docs/${docId}/draft`),
      stranger.token,
    );

    // 404 rather than 403 throughout: a stranger must not be able to tell an
    // existing document they cannot see from one that does not exist.
    for (const res of [heartbeat, presence, draft]) {
      expect(res.status).toBe(404);
    }
  });

  it("turns a revoked collaborator's next heartbeat into the same 404", async () => {
    const before = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      editor.token,
    ).send({});
    expect(before.status).toBe(200);

    await prisma.docCollaborator.delete({
      where: { docId_userId: { docId, userId: editor.id } },
    });

    const after = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      editor.token,
    ).send({});
    // This is the signal the editor turns into "you no longer have access",
    // rather than a beat that silently stops working.
    expect(after.status).toBe(404);

    await prisma.docCollaborator.create({
      data: { docId, userId: editor.id, role: "editor" },
    });
  });

  it("requires a session", async () => {
    const res = await request(app).get(`/docs/${docId}/presence`);
    expect(res.status).toBe(401);
  });

  it("refuses a draft heartbeat with no X-CSRF-Token header, and writes nothing [AC-134]", async () => {
    const res = await request(app)
      .post(`/docs/${docId}/draft`)
      .set("Cookie", [
        `${ACCESS_TOKEN_COOKIE}=${editor.token}`,
        `${CSRF_COOKIE}=${CSRF_VALUE}`,
      ])
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "csrf_token_invalid" } });
    expect(await prisma.docPresence.count({ where: { docId } })).toBe(0);
    expect(await prisma.docDraft.count({ where: { docId } })).toBe(0);
  });

  it("refuses a draft heartbeat whose header does not match the CSRF cookie, and writes nothing [AC-134]", async () => {
    const res = await request(app)
      .post(`/docs/${docId}/draft`)
      .set("Cookie", [
        `${ACCESS_TOKEN_COOKIE}=${editor.token}`,
        `${CSRF_COOKIE}=${CSRF_VALUE}`,
      ])
      .set("X-CSRF-Token", "a-value-that-does-not-match-the-cookie")
      .send({ update: encodeText("blocked by csrf") });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "csrf_token_invalid" } });
    expect(await prisma.docPresence.count({ where: { docId } })).toBe(0);
    expect(await prisma.docDraft.count({ where: { docId } })).toBe(0);
  });

  it("accepts a draft heartbeat once the X-CSRF-Token header matches the cookie (control) [AC-134]", async () => {
    const res = await withSession(
      request(app).post(`/docs/${docId}/draft`),
      editor.token,
    ).send({});

    // Same request as the two rejections above, differing only in the header
    // matching the cookie — proves the guard, not something else, drew the line.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ backedUpAt: null });
  });

  it("lists everyone currently present, the caller included", async () => {
    await withSession(request(app).post(`/docs/${docId}/draft`), owner.token).send({});
    await withSession(request(app).post(`/docs/${docId}/draft`), viewer.token).send({});

    const res = await withSession(
      request(app).get(`/docs/${docId}/presence`),
      owner.token,
    );

    expect(res.status).toBe(200);
    expect(
      res.body.present.map((p: { userId: string }) => p.userId).sort(),
    ).toEqual([owner.id, viewer.id].sort());
    // Role travels with presence so the UI can tell a reader from a writer.
    expect(
      res.body.present.find((p: { userId: string }) => p.userId === viewer.id).role,
    ).toBe("viewer");
  });
});
