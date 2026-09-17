import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { AppError } from "../lib/http-error.js";
import { changeRole, removeCollaborator } from "./collaborators.js";

/**
 * The last-owner rule (master spec §2.1) must hold under concurrency: two simultaneous
 * requests each demoting or removing one of two owners — exactly one wins, and the
 * document never ends up ownerless.
 *
 * Repeated over several fresh documents because a single attempt only fails when the
 * scheduler happens to interleave the two transactions; an unlocked read-then-write
 * loses that race on almost every round.
 */
const ROUNDS = 10;
const RACE_TIMEOUT_MS = 30_000;

async function makeUser(tag: string) {
  return prisma.user.create({
    data: {
      email: `last-owner-${tag}-${randomUUID()}@example.test`,
      googleId: `last-owner-${tag}-${randomUUID()}`,
      name: `Last owner ${tag}`,
    },
  });
}

function ownerCount(docId: string): Promise<number> {
  return prisma.docCollaborator.count({ where: { docId, role: "owner" } });
}

function expectExactlyOneLastOwnerRejection(
  results: PromiseSettledResult<unknown>[],
): void {
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  expect(rejected).toHaveLength(1);

  const [{ reason }] = rejected as [PromiseRejectedResult];
  expect(reason).toBeInstanceOf(AppError);
  expect((reason as AppError).code).toBe("last_owner");
}

describe("last-owner rule under concurrency", () => {
  let firstId: string;
  let secondId: string;
  const docIds: string[] = [];

  beforeAll(async () => {
    const [first, second] = await Promise.all([makeUser("a"), makeUser("b")]);
    firstId = first.id;
    secondId = second.id;
  });

  afterAll(async () => {
    await prisma.doc.deleteMany({ where: { id: { in: docIds } } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [firstId, secondId] } } })
      .catch(() => {});
  });

  async function makeTwoOwnerDoc(): Promise<string> {
    const doc = await prisma.doc.create({
      data: {
        title: "Last-owner race fixture",
        ownerId: firstId,
        collaborators: {
          create: [
            { userId: firstId, role: "owner" },
            { userId: secondId, role: "owner" },
          ],
        },
      },
    });
    docIds.push(doc.id);
    return doc.id;
  }

  it(
    "two owners demoted at once leaves exactly one owner",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const docId = await makeTwoOwnerDoc();

        const results = await Promise.allSettled([
          changeRole(docId, firstId, "editor"),
          changeRole(docId, secondId, "editor"),
        ]);

        expectExactlyOneLastOwnerRejection(results);
        expect(await ownerCount(docId)).toBe(1);
      }
    },
    RACE_TIMEOUT_MS,
  );

  it(
    "two owners removed at once leaves exactly one owner",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const docId = await makeTwoOwnerDoc();

        const results = await Promise.allSettled([
          removeCollaborator(docId, firstId),
          removeCollaborator(docId, secondId),
        ]);

        expectExactlyOneLastOwnerRejection(results);
        expect(await ownerCount(docId)).toBe(1);
      }
    },
    RACE_TIMEOUT_MS,
  );

  it(
    "one owner demoted while the other is removed leaves exactly one owner",
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const docId = await makeTwoOwnerDoc();

        const results = await Promise.allSettled([
          changeRole(docId, firstId, "viewer"),
          removeCollaborator(docId, secondId),
        ]);

        expectExactlyOneLastOwnerRejection(results);
        expect(await ownerCount(docId)).toBe(1);
      }
    },
    RACE_TIMEOUT_MS,
  );
});
