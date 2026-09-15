import { randomUUID } from "node:crypto";
import request from "supertest";
import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TS-7 [AC-114] — a draft backup does not trigger a push notification.
 *
 * Mirrors routes/docs.push.test.ts's setup (real route -> controller -> service,
 * only the network transport stubbed) but drives the *heartbeat* route instead of
 * save, and asserts the opposite: after real heartbeats, past a real debounce
 * window, repeated three times, nothing was ever sent.
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

// Push must be genuinely configured for this test to mean anything — with no
// VAPID set, queueDocSavedNotification is already a no-op and the assertion
// below would pass for the wrong reason. See config/env.js's module-level
// `vapid` constant, computed at import time, which is why this has to land
// before the (hoisted) static import of app.js below.
process.env.VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
process.env.VAPID_SUBJECT = "mailto:presence-push-test@example.test";

const { app } = await import("../app.js");
const { prisma } = await import("../db/client.js");
const { signAccessToken } = await import("../lib/jwt.js");
const { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } = await import("../lib/cookies.js");
const { PUSH_DEBOUNCE_MS } = await import("../config/env.js");

const CSRF_TOKEN = "presence-push-route-csrf";

function withSession<T extends request.Test>(req: T, accessToken: string): T {
  return req
    .set("Cookie", [
      `${ACCESS_TOKEN_COOKIE}=${accessToken}`,
      `${CSRF_COOKIE}=${CSRF_TOKEN}`,
    ])
    .set(CSRF_HEADER, CSRF_TOKEN) as T;
}

function draftUpdate(text: string): string {
  const ydoc = new Y.Doc();
  ydoc.getText("body").insert(0, text);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
}

async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `presence-push-${tag}-${randomUUID()}@example.test`,
      googleId: `presence-push-${tag}-${randomUUID()}`,
      name: `Presence push ${tag}`,
    },
  });
  return {
    id: user.id,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("POST /docs/:id/draft — a heartbeat's draft backup queues no push [AC-114]", () => {
  let editor: { id: string; token: string };
  let collaborator: { id: string; token: string };
  let docId: string;

  beforeAll(async () => {
    [editor, collaborator] = await Promise.all([
      makeUser("editor"),
      makeUser("collaborator"),
    ]);

    const doc = await prisma.doc.create({
      data: {
        title: `Presence push fixture ${randomUUID()}`,
        ownerId: editor.id,
        collaborators: {
          create: [
            { userId: editor.id, role: "owner" },
            { userId: collaborator.id, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;

    // Both subscribed, so a wrongly-queued notification would have somewhere
    // real to go rather than silently finding zero recipients.
    await prisma.pushSubscription.createMany({
      data: [
        {
          userId: editor.id,
          endpoint: `https://push.test/presence-push-editor-${randomUUID()}`,
          p256dh: "p256dh-editor",
          auth: "auth-editor",
        },
        {
          userId: collaborator.id,
          endpoint: `https://push.test/presence-push-collaborator-${randomUUID()}`,
          p256dh: "p256dh-collaborator",
          auth: "auth-collaborator",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.pushSubscription
      .deleteMany({ where: { userId: { in: [editor.id, collaborator.id] } } })
      .catch(() => {});
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [editor.id, collaborator.id] } } })
      .catch(() => {});
  });

  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { resetPendingNotifications } = await import("../services/push.js");
    resetPendingNotifications();
  });

  it(
    "sends nothing and leaves nothing pending across three heartbeats, each past the debounce window",
    async () => {
      for (let beat = 1; beat <= 3; beat += 1) {
        const res = await withSession(
          request(app).post(`/docs/${docId}/draft`),
          editor.token,
        ).send({ update: draftUpdate(`beat ${beat}`) });

        expect(res.status).toBe(200);

        // Past the real debounce window — long enough that a wrongly-queued
        // notification would have already fired by the time we check.
        await delay(PUSH_DEBOUNCE_MS + 1_000);

        expect(sendNotification).not.toHaveBeenCalled();
      }
    },
    4 * (PUSH_DEBOUNCE_MS + 1_000) + 5_000,
  );
});
