import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The debounce and the targeting rules, with the network and the database
 * stubbed. What matters here is *who* gets told and *how often* — the delivery
 * mechanics are web-push's problem, not ours.
 */

const sendNotification = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const deleteMany = vi.hoisted(() => vi.fn());

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
  // Same shape as the real class for the one thing the code inspects — an
  // `instanceof` check plus `statusCode`. The remaining constructor arguments
  // exist only to satisfy the published signature.
  WebPushError: class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

/** Builds a rejection that `instanceof WebPushError` recognises in the module under test. */
async function webPushError(statusCode: number): Promise<Error> {
  const { WebPushError } = await import("web-push");
  return new WebPushError("push failed", statusCode, {} as never, "", "");
}

vi.mock("../db/client.js", () => ({
  prisma: { pushSubscription: { findMany, deleteMany } },
}));

// Push is a no-op without a complete VAPID set, so the module must believe it
// is configured for any of this to run at all.
vi.mock("../config/env.js", () => ({
  PUSH_DEBOUNCE_MS: 5_000,
  vapid: {
    publicKey: "test-public",
    privateKey: "test-private",
    subject: "mailto:test@example.test",
  },
}));

const { queueDocSavedNotification, resetPendingNotifications } = await import(
  "./push.js"
);

function subscription(id: string) {
  return { id, endpoint: `https://push.test/${id}`, p256dh: "p", auth: "a" };
}

function save(overrides: Partial<Parameters<typeof queueDocSavedNotification>[0]> = {}) {
  queueDocSavedNotification({
    docId: "doc-1",
    docTitle: "Quarterly plan",
    editorId: "editor-1",
    editorName: "Ada",
    changeSummary: "added 3 lines",
    ...overrides,
  });
}

describe("push — debounce and targeting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendNotification.mockReset().mockResolvedValue(undefined);
    findMany.mockReset().mockResolvedValue([subscription("sub-1")]);
    deleteMany.mockReset().mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    resetPendingNotifications();
    vi.useRealTimers();
  });

  it("sends nothing until the debounce window has elapsed", async () => {
    save();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(sendNotification).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of saves into a single notification", async () => {
    save();
    await vi.advanceTimersByTimeAsync(3_000);
    save(); // the typo fixed right after saving — restarts the timer
    await vi.advanceTimersByTimeAsync(3_000);
    save();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("describes the latest save in the burst, not the first", async () => {
    save({ changeSummary: "added 1 line" });
    await vi.advanceTimersByTimeAsync(1_000);
    save({ changeSummary: "removed 4 lines", editorName: "Priya" });

    await vi.advanceTimersByTimeAsync(5_000);

    const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({
      editorName: "Priya",
      changeSummary: "removed 4 lines",
    });
  });

  it("debounces each document independently", async () => {
    save({ docId: "doc-1" });
    save({ docId: "doc-2" });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("excludes the person who saved from the recipient query", async () => {
    save({ editorId: "editor-1" });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: {
            collaborations: { some: { docId: "doc-1" } },
            id: { not: "editor-1" },
          },
        },
      }),
    );
  });

  it("sends to nobody, and does not throw, when the only collaborator is the saver", async () => {
    findMany.mockResolvedValue([]);

    save();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("prunes an endpoint the push service reports as permanently gone", async () => {
    findMany.mockResolvedValue([subscription("sub-1"), subscription("sub-2")]);
    sendNotification
      .mockRejectedValueOnce(await webPushError(410))
      .mockResolvedValueOnce(undefined);

    save();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sub-1"] } } });
  });

  it("keeps an endpoint that failed for a reason that might not recur", async () => {
    findMany.mockResolvedValue([subscription("sub-1")]);
    // A 503 is the push service having a bad day, not a dead subscription.
    sendNotification.mockRejectedValue(await webPushError(503));

    save();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("delivers to the rest when one recipient's send fails", async () => {
    findMany.mockResolvedValue([subscription("sub-1"), subscription("sub-2")]);
    sendNotification
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    save();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });
});
