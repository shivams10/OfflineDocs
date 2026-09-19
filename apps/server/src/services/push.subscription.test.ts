import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/client.js";
import { removeSubscription, saveSubscription } from "./push.js";

/**
 * Ownership and endpoint-identity rules on the real subscription table. Both
 * scenarios here turn on unique-column / where-clause semantics a mocked
 * Prisma client would happily fake — a broken `create` or a `where` missing
 * `userId` looks identical to a passing test until it hits a live constraint.
 */

async function makeUser(tag: string) {
  return prisma.user.create({
    data: {
      email: `push-sub-${tag}-${randomUUID()}@example.test`,
      googleId: `push-sub-${tag}-${randomUUID()}`,
      name: `Push Sub ${tag}`,
    },
  });
}

function freshEndpoint() {
  return `https://push.test/${randomUUID()}`;
}

describe("push subscriptions — ownership and endpoint identity", () => {
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const [userA, userB] = await Promise.all([makeUser("a"), makeUser("b")]);
    userAId = userA.id;
    userBId = userB.id;
  });

  afterEach(async () => {
    await prisma.pushSubscription.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
  });

  afterAll(async () => {
    await prisma.user
      .deleteMany({ where: { id: { in: [userAId, userBId] } } })
      .catch(() => {});
  });

  it("knowing an endpoint string does not let you unsubscribe someone else [AC-133]", async () => {
    const endpoint = freshEndpoint();
    await saveSubscription(userBId, {
      endpoint,
      keys: { p256dh: "b-p256dh", auth: "b-auth" },
    });

    // A never had this row, only knows the endpoint string.
    await expect(removeSubscription(userAId, endpoint)).resolves.toBeUndefined();

    const survivor = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    expect(survivor).not.toBeNull();
    expect(survivor!.userId).toBe(userBId);

    // Control: the rightful owner can remove their own row through the same call.
    await removeSubscription(userBId, endpoint);
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint } })).toBeNull();
  });

  it("a shared browser's endpoint moves to whoever signed in last [AC-132]", async () => {
    const endpoint = freshEndpoint();
    await saveSubscription(userAId, {
      endpoint,
      keys: { p256dh: "a-p256dh", auth: "a-auth" },
    });

    await saveSubscription(userBId, {
      endpoint,
      keys: { p256dh: "b-p256dh", auth: "b-auth" },
    });

    const rowsForEndpoint = await prisma.pushSubscription.findMany({ where: { endpoint } });
    expect(rowsForEndpoint).toHaveLength(1);
    expect(rowsForEndpoint[0]!.userId).toBe(userBId);
    expect(rowsForEndpoint[0]!.p256dh).toBe("b-p256dh");
    expect(rowsForEndpoint[0]!.auth).toBe("b-auth");

    const aSubscriptions = await prisma.pushSubscription.findMany({
      where: { userId: userAId },
    });
    expect(aSubscriptions).toHaveLength(0);
  });
});
