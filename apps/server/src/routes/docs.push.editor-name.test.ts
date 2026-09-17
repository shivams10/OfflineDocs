import { randomUUID } from "node:crypto";
import request from "supertest";
import * as Y from "yjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proves the `editorName` on a queued push notification is never the
 * saver's email — a saver with no Google display name must be announced
 * generically ("A collaborator"), and a saver who does have one is still
 * announced by name (AC-21 / AC-22).
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

process.env.VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
process.env.VAPID_SUBJECT = "mailto:push-editor-name-test@example.test";

const { app } = await import("../app.js");
const { prisma } = await import("../db/client.js");
const { signAccessToken } = await import("../lib/jwt.js");
const { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, CSRF_HEADER } = await import("../lib/cookies.js");

const CSRF_TOKEN = "docs-push-editor-name-csrf";

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

async function makeUser(tag: string, name: string | null) {
  const user = await prisma.user.create({
    data: {
      email: `docs-push-editor-name-${tag}-${randomUUID()}@example.test`,
      googleId: `docs-push-editor-name-${tag}-${randomUUID()}`,
      name,
    },
  });
  return {
    id: user.id,
    email: user.email,
    token: await signAccessToken({ sub: user.id, email: user.email }),
  };
}

async function makeDocWithSubscribers(
  saver: { id: string },
  recipient: { id: string },
) {
  const docTitle = `Push editor-name fixture ${randomUUID()}`;
  const doc = await prisma.doc.create({
    data: {
      title: docTitle,
      ownerId: recipient.id,
      collaborators: {
        create: [
          { userId: recipient.id, role: "owner" },
          { userId: saver.id, role: "editor" },
        ],
      },
    },
  });

  await prisma.pushSubscription.createMany({
    data: [
      {
        userId: recipient.id,
        endpoint: `https://push.test/docs-push-editor-name-recipient-${randomUUID()}`,
        p256dh: "p256dh-recipient",
        auth: "auth-recipient",
      },
      {
        userId: saver.id,
        endpoint: `https://push.test/docs-push-editor-name-saver-${randomUUID()}`,
        p256dh: "p256dh-saver",
        auth: "auth-saver",
      },
    ],
  });

  return { docId: doc.id, docTitle };
}

describe("save notification editorName never leaks an email [AC-21][AC-22]", () => {
  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { resetPendingNotifications } = await import("../services/push.js");
    resetPendingNotifications();
  });

  describe("a saver with no display name", () => {
    let saver: { id: string; email: string; token: string };
    let recipient: { id: string; token: string };
    let docId: string;

    beforeAll(async () => {
      [saver, recipient] = await Promise.all([
        makeUser("nameless-saver", null),
        makeUser("nameless-recipient", "Recipient"),
      ]);
      ({ docId } = await makeDocWithSubscribers(saver, recipient));
    });

    afterAll(async () => {
      await prisma.pushSubscription
        .deleteMany({ where: { userId: { in: [saver.id, recipient.id] } } })
        .catch(() => {});
      await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
      await prisma.user
        .deleteMany({ where: { id: { in: [saver.id, recipient.id] } } })
        .catch(() => {});
    });

    it('announces the saver as "A collaborator", never by email', async () => {
      const res = await withSession(
        request(app).post(`/docs/${docId}/save`),
        saver.token,
      ).send({ update: textUpdate("nameless saver content") });

      expect(res.status).toBe(200);

      await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1), {
        timeout: 8_000,
      });

      const rawPayload = sendNotification.mock.calls[0]![1] as string;
      const payload = JSON.parse(rawPayload) as { editorName: string };

      expect(payload.editorName).toBe("A collaborator");
      expect(rawPayload).not.toContain("@");
      expect(rawPayload).not.toContain(saver.email);
    }, 10_000);
  });

  describe("a saver who has a display name", () => {
    let saver: { id: string; token: string };
    let recipient: { id: string; token: string };
    let docId: string;

    beforeAll(async () => {
      [saver, recipient] = await Promise.all([
        makeUser("named-saver", "Push namer"),
        makeUser("named-recipient", "Recipient"),
      ]);
      ({ docId } = await makeDocWithSubscribers(saver, recipient));
    });

    afterAll(async () => {
      await prisma.pushSubscription
        .deleteMany({ where: { userId: { in: [saver.id, recipient.id] } } })
        .catch(() => {});
      await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
      await prisma.user
        .deleteMany({ where: { id: { in: [saver.id, recipient.id] } } })
        .catch(() => {});
    });

    it("is still announced by that display name", async () => {
      const res = await withSession(
        request(app).post(`/docs/${docId}/save`),
        saver.token,
      ).send({ update: textUpdate("named saver content") });

      expect(res.status).toBe(200);

      await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(1), {
        timeout: 8_000,
      });

      const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string) as {
        editorName: string;
      };

      expect(payload.editorName).toBe("Push namer");
    }, 10_000);
  });
});
