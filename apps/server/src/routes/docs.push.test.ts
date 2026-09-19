import { randomUUID } from "node:crypto";
import request from "supertest";
import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proves the save route is actually wired to the push queue — not that the
 * queue itself works (push.debounce.test.ts already owns the debounce and
 * targeting rules with everything stubbed). Only the network transport is
 * stubbed here; the route, the controller, the save service and the queue
 * are all real.
 */

const sendNotification = vi.hoisted(() => vi.fn());

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
  WebPushError: class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// A complete VAPID set must exist before `config/env.js` (imported
// transitively by `app.js`) computes its module-level `vapid` constant, so
// this has to run before that import — a static `import { app } from
// "../app.js"` would be hoisted ahead of any assignment made here. Vitest
// gives every test file its own module registry, so this does not leak into
// other suites.
process.env.VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
process.env.VAPID_SUBJECT = "mailto:push-route-test@example.test";

const { app } = await import("../app.js");
const { prisma } = await import("../db/client.js");
const { signAccessToken } = await import("../lib/jwt.js");
const { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } = await import("../lib/cookies.js");

const CSRF_TOKEN = "docs-push-route-csrf";

function withSession<T extends request.Test>(req: T, accessToken: string): T {
  return req
    .set("Cookie", [
      `${ACCESS_TOKEN_COOKIE}=${accessToken}`,
      `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    ])
    .set(CSRF_HEADER, CSRF_TOKEN) as T;
}

function textUpdate(text: string): string {
  const ydoc = new Y.Doc();
  ydoc.getText("content").insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
}

async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `docs-push-${tag}-${randomUUID()}@example.test`,
      googleId: `docs-push-${tag}-${randomUUID()}`,
      name: `Push ${tag}`,
    },
  });
  return {
    id: user.id,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

describe("POST /docs/:id/save — queues a Web Push for other subscribed collaborators [AC-121]", () => {
  let owner: { id: string; token: string };
  let collaborator: { id: string; token: string };
  let docId: string;
  let docTitle: string;

  beforeAll(async () => {
    [owner, collaborator] = await Promise.all([makeUser("owner"), makeUser("collaborator")]);

    docTitle = `Push fixture ${randomUUID()}`;
    const doc = await prisma.doc.create({
      data: {
        title: docTitle,
        ownerId: owner.id,
        collaborators: {
          create: [
            { userId: owner.id, role: "owner" },
            { userId: collaborator.id, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;

    await prisma.pushSubscription.createMany({
      data: [
        {
          userId: owner.id,
          endpoint: `https://push.test/docs-push-owner-${randomUUID()}`,
          p256dh: "p256dh-owner",
          auth: "auth-owner",
        },
        {
          userId: collaborator.id,
          endpoint: `https://push.test/docs-push-collaborator-${randomUUID()}`,
          p256dh: "p256dh-collaborator",
          auth: "auth-collaborator",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.pushSubscription
      .deleteMany({ where: { userId: { in: [owner.id, collaborator.id] } } })
      .catch(() => {});
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, collaborator.id] } } })
      .catch(() => {});
  });

  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { resetPendingNotifications } = await import("../services/push.js");
    resetPendingNotifications();
  });

  it("sends exactly one notification, for this doc's id and title, once the merge is durable", async () => {
    const res = await withSession(
      request(app).post(`/docs/${docId}/save`),
      owner.token,
    ).send({ update: textUpdate("pushed content") });

    // The save itself is unaffected by anything push-related.
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1), {
      timeout: 8_000,
    });

    const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string) as {
      docId: string;
      docTitle: string;
    };
    expect(payload.docId).toBe(docId);
    expect(payload.docTitle).toBe(docTitle);

    // Sent to the other collaborator's subscription, not the saver's own.
    const [target] = sendNotification.mock.calls[0]!;
    expect((target as { endpoint: string }).endpoint).toContain("docs-push-collaborator-");
  }, 10_000);

  it("does not turn a successful save into an error response when the send later fails", async () => {
    sendNotification.mockRejectedValue(new Error("push transport unavailable"));

    const res = await withSession(
      request(app).post(`/docs/${docId}/save`),
      owner.token,
    ).send({ update: textUpdate("more pushed content") });

    expect(res.status).toBe(200);
    expect(res.body.doc.id).toBe(docId);

    // Give the debounced send its chance to actually fail before concluding
    // the response was really unaffected by it, rather than just by luck of
    // timing.
    await vi.waitFor(() => expect(sendNotification).toHaveBeenCalled(), {
      timeout: 8_000,
    });
  }, 10_000);
});
