import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../app.js";
import { prisma } from "../db/client.js";
import { signAccessToken } from "../lib/jwt.js";
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } from "../lib/cookies.js";

// requireCsrfToken only compares the cookie and header for equality — any
// shared value works for a test session, it doesn't need to be server-issued.
const CSRF_VALUE = "push-route-csrf";

/** Mirrors how every other route suite here presents a session. */
function withSession(req: request.Test, token: string): request.Test {
  return req
    .set("Cookie", [
      `${ACCESS_TOKEN_COOKIE}=${token}`,
      `${CSRF_COOKIE}=${CSRF_VALUE}`,
    ])
    .set(CSRF_HEADER, CSRF_VALUE);
}

/** Same session cookies, deliberately missing the header the guard checks. */
function withCookiesOnly(req: request.Test, token: string): request.Test {
  return req.set("Cookie", [
    `${ACCESS_TOKEN_COOKIE}=${token}`,
    `${CSRF_COOKIE}=${CSRF_VALUE}`,
  ]);
}

async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `push-route-${tag}-${randomUUID()}@example.test`,
      googleId: `push-route-${tag}-${randomUUID()}`,
      name: `Push route ${tag}`,
    },
  });
  return {
    id: user.id,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

function subscriptionBody(tag: string) {
  return {
    endpoint: `https://push.test/${tag}-${randomUUID()}`,
    keys: { p256dh: `p256dh-${tag}`, auth: `auth-${tag}` },
  };
}

describe("push routes — CSRF and auth guards", () => {
  let user: { id: string; token: string };

  beforeAll(async () => {
    user = await makeUser("owner");
  });

  afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  beforeEach(async () => {
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
  });

  it("refuses subscribe and unsubscribe with no X-CSRF-Token header, and writes nothing [AC-134]", async () => {
    const { endpoint, keys } = subscriptionBody("no-header");

    const subscribeAttempt = await withCookiesOnly(
      request(app).post("/push/subscribe"),
      user.token,
    ).send({ endpoint, keys });

    expect(subscribeAttempt.status).toBe(403);
    expect(subscribeAttempt.body).toMatchObject({
      error: { code: "csrf_token_invalid" },
    });
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).toBeNull();

    // Seed the row directly so the unsubscribe attempt has something real to
    // fail to delete, rather than a no-op that would pass for the wrong reason.
    await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    const unsubscribeAttempt = await withCookiesOnly(
      request(app).delete("/push/subscribe"),
      user.token,
    ).send({ endpoint });

    expect(unsubscribeAttempt.status).toBe(403);
    expect(unsubscribeAttempt.body).toMatchObject({
      error: { code: "csrf_token_invalid" },
    });
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).not.toBeNull();
  });

  it("accepts subscribe and unsubscribe once the X-CSRF-Token header matches the cookie (control) [AC-134]", async () => {
    const { endpoint, keys } = subscriptionBody("matching-header");

    const subscribeRes = await withSession(
      request(app).post("/push/subscribe"),
      user.token,
    ).send({ endpoint, keys });

    expect(subscribeRes.status).toBe(204);
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).not.toBeNull();

    const unsubscribeRes = await withSession(
      request(app).delete("/push/subscribe"),
      user.token,
    ).send({ endpoint });

    expect(unsubscribeRes.status).toBe(204);
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).toBeNull();
  });

  it("returns 401 from every push route for an anonymous caller, without disclosing the VAPID key [AC-135]", async () => {
    const { endpoint, keys } = subscriptionBody("anon");

    // No access-token cookie on any of these. CSRF is satisfied on the two
    // mutating calls so the 401 is unambiguously the auth guard's, not the
    // CSRF guard's — GET is a safe method the CSRF guard never checks.
    const vapidRes = await request(app).get("/push/vapid-public-key");

    const subscribeRes = await request(app)
      .post("/push/subscribe")
      .set("Cookie", [`${CSRF_COOKIE}=${CSRF_VALUE}`])
      .set(CSRF_HEADER, CSRF_VALUE)
      .send({ endpoint, keys });

    const unsubscribeRes = await request(app)
      .delete("/push/subscribe")
      .set("Cookie", [`${CSRF_COOKIE}=${CSRF_VALUE}`])
      .set(CSRF_HEADER, CSRF_VALUE)
      .send({ endpoint });

    for (const res of [vapidRes, subscribeRes, unsubscribeRes]) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: { code: "unauthorized" } });
    }
    expect(vapidRes.body).not.toHaveProperty("publicKey");
    expect(
      await prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).toBeNull();
  });
});
