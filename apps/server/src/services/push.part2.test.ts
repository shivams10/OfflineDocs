import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db/client.js";

/**
 * TS-10 — the wire shape of a notification, against a real doc and a real
 * collaborator lookup. Everything past the network boundary (web-push itself,
 * and the debounce/targeting rules already covered by push.debounce.test.ts)
 * is out of scope here; what matters is that the payload never grows a field
 * nobody specified — especially not document content.
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

// Push is a no-op without a complete VAPID set, and the local dev .env in
// this repo deliberately ships without one — mock it configured, same as
// push.debounce.test.ts, and keep the debounce window short so the test
// doesn't sit around waiting on a real 5s timer.
vi.mock("../config/env.js", () => ({
  PUSH_DEBOUNCE_MS: 10,
  vapid: {
    publicKey: "test-public",
    privateKey: "test-private",
    subject: "mailto:test@example.test",
  },
}));

const { queueDocSavedNotification, resetPendingNotifications } = await import(
  "./push.js"
);

describe("push — notification payload shape", () => {
  const ownerEmail = `qa-ts10-owner-${randomUUID()}@example.test`;
  const collabEmail = `qa-ts10-collab-${randomUUID()}@example.test`;
  const docTitle = `TS-10 distinctive title ${randomUUID()}`;
  let ownerId: string;
  let collabId: string;
  let docId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        googleId: `qa-ts10-owner-google-${randomUUID()}`,
        name: "TS-10 Owner",
      },
    });
    ownerId = owner.id;

    const collaborator = await prisma.user.create({
      data: {
        email: collabEmail,
        googleId: `qa-ts10-collab-google-${randomUUID()}`,
        name: "TS-10 Collaborator",
      },
    });
    collabId = collaborator.id;

    const doc = await prisma.doc.create({
      data: {
        title: docTitle,
        ownerId,
        collaborators: {
          create: [
            { userId: ownerId, role: "owner" },
            { userId: collabId, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;

    const subscription = await prisma.pushSubscription.create({
      data: {
        userId: collabId,
        endpoint: `https://push.test/ts10-${randomUUID()}`,
        p256dh: "p",
        auth: "a",
      },
    });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    await prisma.pushSubscription.delete({ where: { id: subscriptionId } }).catch(() => {});
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user.delete({ where: { id: collabId } }).catch(() => {});
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  });

  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetPendingNotifications();
  });

  it("carries exactly docId, docTitle, editorName, changeSummary and nothing else [AC-126]", async () => {
    queueDocSavedNotification({
      docId,
      docTitle,
      editorId: ownerId,
      editorName: "TS-10 Owner",
      changeSummary: "added 3 lines",
    });

    await vi.waitFor(() => {
      expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    const body = sendNotification.mock.calls[0]![1] as string;
    const payload = JSON.parse(body) as Record<string, unknown>;

    // Exact key set, not toMatchObject: the point of this test is to catch a
    // field that gets *added* later (a snapshot, update bytes, raw text).
    expect(Object.keys(payload).sort()).toEqual(
      ["changeSummary", "docId", "docTitle", "editorName"].sort(),
    );
    expect(payload).toEqual({
      docId,
      docTitle,
      editorName: "TS-10 Owner",
      changeSummary: "added 3 lines",
    });
  });
});
