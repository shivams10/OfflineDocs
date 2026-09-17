import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CollaboratorResponse } from "@docsync/shared";
import { app } from "../app.js";
import { prisma } from "../db/client.js";
import { signAccessToken } from "../lib/jwt.js";
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } from "../lib/cookies.js";

/**
 * PATCH /docs/:id/collaborators/:userId is owner-only (master spec §Phase 1 Part 3), and
 * unlike the list endpoint its response always includes the target's email — the share
 * panel's only source of a fresh address for that member. [AC-12]
 */
const CSRF_TOKEN = "test-csrf-token";

function withSession<T extends request.Test>(req: T, accessToken: string): T {
  return req
    .set("Cookie", [
      `${ACCESS_TOKEN_COOKIE}=${accessToken}`,
      `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    ])
    .set(CSRF_HEADER, CSRF_TOKEN) as T;
}

async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `owner-routes-${tag}-${randomUUID()}@example.test`,
      googleId: `owner-routes-${tag}-${randomUUID()}`,
      name: `Owner routes ${tag}`,
    },
  });
  return {
    id: user.id,
    email: user.email,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

describe("PATCH /docs/:id/collaborators/:userId — owner-only response shape", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let editor: Awaited<ReturnType<typeof makeUser>>;
  let docId: string;

  beforeAll(async () => {
    [owner, editor] = await Promise.all([makeUser("owner"), makeUser("editor")]);

    const doc = await prisma.doc.create({
      data: {
        title: "Owner-route response fixture",
        ownerId: owner.id,
        collaborators: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: editor.id, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, editor.id] } } })
      .catch(() => {});
  });

  it("[AC-12] returns the demoted member's real email and new role", async () => {
    const res = await withSession(
      request(app).patch(`/docs/${docId}/collaborators/${editor.id}`),
      owner.token,
    ).send({ role: "viewer" });

    expect(res.status).toBe(200);
    const body = res.body as CollaboratorResponse;
    expect(body.collaborator.email).toBe(editor.email);
    expect(body.collaborator.role).toBe("viewer");
  });
});
