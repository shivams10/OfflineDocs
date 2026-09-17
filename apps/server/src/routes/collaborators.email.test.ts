import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CollaboratorsResponse } from "@docsync/shared";
import { app } from "../app.js";
import { prisma } from "../db/client.js";
import { signAccessToken } from "../lib/jwt.js";
import { ACCESS_TOKEN_COOKIE } from "../lib/cookies.js";

/**
 * Only an owner sees collaborators' email addresses (master spec §Phase 1 Part 3).
 * The list endpoint is viewer+, so this has to be true in the JSON itself — hiding
 * the address in the UI would still hand it to anyone reading the response.
 */
async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `collab-email-${tag}-${randomUUID()}@example.test`,
      googleId: `collab-email-${tag}-${randomUUID()}`,
      name: `Email ${tag}`,
    },
  });
  return {
    id: user.id,
    email: user.email,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

describe("GET /docs/:id/collaborators — email visibility by role", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let editor: Awaited<ReturnType<typeof makeUser>>;
  let viewer: Awaited<ReturnType<typeof makeUser>>;
  let docId: string;

  beforeAll(async () => {
    [owner, editor, viewer] = await Promise.all([
      makeUser("owner"),
      makeUser("editor"),
      makeUser("viewer"),
    ]);

    const doc = await prisma.doc.create({
      data: {
        title: "Collaborator email fixture",
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
      .deleteMany({ where: { id: { in: [owner.id, editor.id, viewer.id] } } })
      .catch(() => {});
  });

  async function listAs(token: string): Promise<CollaboratorsResponse> {
    const res = await request(app)
      .get(`/docs/${docId}/collaborators`)
      .set("Cookie", `${ACCESS_TOKEN_COOKIE}=${token}`);
    expect(res.status).toBe(200);
    return res.body as CollaboratorsResponse;
  }

  it("gives an owner every collaborator's email", async () => {
    const { collaborators } = await listAs(owner.token);

    const emailById = new Map(
      collaborators.map(({ userId, email }) => [userId, email]),
    );
    expect(emailById.get(owner.id)).toBe(owner.email);
    expect(emailById.get(editor.id)).toBe(editor.email);
    expect(emailById.get(viewer.id)).toBe(viewer.email);
  });

  it("gives an editor names only — every email is null in the JSON", async () => {
    const { collaborators } = await listAs(editor.token);

    expect(collaborators).toHaveLength(3);
    for (const { email, name } of collaborators) {
      expect(email).toBeNull();
      expect(name).toEqual(expect.any(String));
    }
  });

  // The matrix (master spec §2) gives a viewer no sight of the member list at all, so this
  // is 403 rather than a 200 carrying nulled-out emails.
  it("refuses a viewer the member list entirely", async () => {
    const res = await request(app)
      .get(`/docs/${docId}/collaborators`)
      .set("Cookie", `${ACCESS_TOKEN_COOKIE}=${viewer.token}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "forbidden" } });
  });
});
