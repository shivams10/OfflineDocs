import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { AppError } from "../lib/http-error.js";
import { changeRole, removeCollaborator } from "./collaborators.js";

/**
 * The last-owner rule (master spec §2.1) in its non-concurrent form: a document with a
 * single owner and no race must still refuse to end up ownerless, and the not-found
 * check inside the same locking transaction must still fire before anything is written.
 *
 * collaborators.last-owner.test.ts covers the two-owner race; these are the sole-owner
 * path that race test never exercises.
 */
async function makeUser(tag: string) {
  return prisma.user.create({
    data: {
      email: `collab-rules-${tag}-${randomUUID()}@example.test`,
      googleId: `collab-rules-${tag}-${randomUUID()}`,
      name: `Rules ${tag}`,
    },
  });
}

describe("last-owner rule — sole owner, no race", () => {
  let ownerId: string;
  let strangerId: string;
  const docIds: string[] = [];

  beforeAll(async () => {
    const [owner, stranger] = await Promise.all([
      makeUser("owner"),
      makeUser("stranger"),
    ]);
    ownerId = owner.id;
    strangerId = stranger.id;
  });

  afterAll(async () => {
    await prisma.doc.deleteMany({ where: { id: { in: docIds } } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [ownerId, strangerId] } } })
      .catch(() => {});
  });

  async function makeSoleOwnerDoc(): Promise<string> {
    const doc = await prisma.doc.create({
      data: {
        title: "Sole-owner rules fixture",
        ownerId,
        collaborators: {
          create: [{ userId: ownerId, role: "owner" }],
        },
      },
    });
    docIds.push(doc.id);
    return doc.id;
  }

  it("[AC-5] rejects demoting a sole owner with last_owner and leaves the role unchanged", async () => {
    const docId = await makeSoleOwnerDoc();

    await expect(changeRole(docId, ownerId, "editor")).rejects.toMatchObject({
      code: "last_owner",
      status: 400,
    });

    const row = await prisma.docCollaborator.findUniqueOrThrow({
      where: { docId_userId: { docId, userId: ownerId } },
    });
    expect(row.role).toBe("owner");
  });

  it("[AC-6] rejects removing a sole owner with last_owner and keeps the collaborator row", async () => {
    const docId = await makeSoleOwnerDoc();

    await expect(removeCollaborator(docId, ownerId)).rejects.toMatchObject({
      code: "last_owner",
      status: 400,
    });

    expect(
      await prisma.docCollaborator.count({ where: { docId, role: "owner" } }),
    ).toBe(1);
    const row = await prisma.docCollaborator.findUniqueOrThrow({
      where: { docId_userId: { docId, userId: ownerId } },
    });
    expect(row.role).toBe("owner");
  });

  it("[AC-8] rejects changeRole on a non-collaborator with a 404, not last_owner", async () => {
    const docId = await makeSoleOwnerDoc();

    let caught: unknown;
    try {
      await changeRole(docId, strangerId, "viewer");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).status).toBe(404);
    expect((caught as AppError).message).toBe("Collaborator not found");
  });

  it("[AC-8] rejects removeCollaborator on a non-collaborator with a 404, not last_owner", async () => {
    const docId = await makeSoleOwnerDoc();

    let caught: unknown;
    try {
      await removeCollaborator(docId, strangerId);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).status).toBe(404);
    expect((caught as AppError).message).toBe("Collaborator not found");

    // The owner row must be untouched by the failed attempt.
    const row = await prisma.docCollaborator.findUniqueOrThrow({
      where: { docId_userId: { docId, userId: ownerId } },
    });
    expect(row.role).toBe("owner");
  });
});
