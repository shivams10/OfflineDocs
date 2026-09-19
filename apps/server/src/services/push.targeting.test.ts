import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "../db/client.js";

/**
 * Who receives a save notification, resolved against the real ACL through a
 * real database read at send time -- not a mocked Prisma client that would
 * return whatever the test told it to, and not a recipient list captured
 * once at save time and reused regardless of what happens before it fires.
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

// Push is a no-op without a complete VAPID set. The dev .env intentionally
// ships without one (see .env.example), so the module must believe it is
// configured for any of this to run at all -- only the two exports push.ts
// actually reads are stubbed; the database stays real and unmocked below.
//
// The window is real milliseconds, not faked: the timer callback triggers a
// real Postgres round trip, and vitest's fake timers only fast-forward the
// setTimeout itself -- they do not wait out the real I/O a mocked-DB test
// (push.debounce.test.ts) never has to contend with. Short enough to keep
// the suite fast, long enough to comfortably outlast a local query.
const DEBOUNCE_MS = 150;

vi.mock("../config/env.js", () => ({
  PUSH_DEBOUNCE_MS: DEBOUNCE_MS,
  vapid: {
    publicKey: "test-public",
    privateKey: "test-private",
    subject: "mailto:test@example.test",
  },
}));

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { queueDocSavedNotification, resetPendingNotifications } = await import(
  "./push.js"
);

async function makeUser(tag: string) {
  return prisma.user.create({
    data: {
      email: `push-target-${tag}-${randomUUID()}@example.test`,
      googleId: `push-target-${tag}-${randomUUID()}`,
      name: `Push Target ${tag}`,
    },
  });
}

async function subscribe(userId: string): Promise<string> {
  const endpoint = `https://push.test/${randomUUID()}`;
  await prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: "p", auth: "a" },
  });
  return endpoint;
}

function endpointsCalled(): string[] {
  return sendNotification.mock.calls.map(
    (call) => (call[0] as { endpoint: string }).endpoint,
  );
}

describe("push targeting — ACL enforced when the notification fires", () => {
  let ownerId: string;
  let editorId: string;
  let strangerId: string;
  let docId: string;

  beforeAll(async () => {
    const [owner, editor, stranger] = await Promise.all([
      makeUser("owner"),
      makeUser("editor"),
      makeUser("stranger"),
    ]);
    ownerId = owner.id;
    editorId = editor.id;
    strangerId = stranger.id;

    const doc = await prisma.doc.create({
      data: {
        title: "Targeting fixture",
        ownerId,
        collaborators: {
          create: [
            { userId: ownerId, role: "owner" },
            { userId: editorId, role: "editor" },
          ],
        },
      },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await prisma.pushSubscription
      .deleteMany({ where: { userId: { in: [ownerId, editorId, strangerId] } } })
      .catch(() => {});
    await prisma.doc.delete({ where: { id: docId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [ownerId, editorId, strangerId] } } })
      .catch(() => {});
  });

  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    resetPendingNotifications();
    await prisma.pushSubscription.deleteMany({
      where: { userId: { in: [ownerId, editorId, strangerId] } },
    });
    // TS-9 revokes the editor's role mid-test; restore it so later tests
    // (and re-runs) start from the fixture's declared shape.
    await prisma.docCollaborator.upsert({
      where: { docId_userId: { docId, userId: editorId } },
      create: { docId, userId: editorId, role: "editor" },
      update: { role: "editor" },
    });
  });

  function saveByOwner() {
    queueDocSavedNotification({
      docId,
      docTitle: "Targeting fixture",
      editorId: ownerId,
      editorName: "Owner",
      changeSummary: "edited",
    });
  }

  it("a subscriber with no role on the document receives nothing [AC-125]", async () => {
    const editorEndpoint = await subscribe(editorId);
    const strangerEndpoint = await subscribe(strangerId);

    saveByOwner();

    await vi.waitFor(
      () => {
        expect(sendNotification).toHaveBeenCalledTimes(1);
      },
      { timeout: 3_000, interval: 20 },
    );
    expect(endpointsCalled()).toEqual([editorEndpoint]);

    const strangerSubscription = await prisma.pushSubscription.findUnique({
      where: { endpoint: strangerEndpoint },
    });
    expect(strangerSubscription).not.toBeNull();
    expect(strangerSubscription!.userId).toBe(strangerId);
  });

  it("access removed during the debounce window removes the recipient [AC-125]", async () => {
    await subscribe(editorId);

    saveByOwner();
    // Well inside the window: the pending timer has not fired yet.
    await wait(DEBOUNCE_MS / 3);

    // Access revoked before the debounce window elapses.
    await prisma.docCollaborator.delete({
      where: { docId_userId: { docId, userId: editorId } },
    });

    // Past the window, plus margin for the real send that must NOT happen.
    await wait(DEBOUNCE_MS + 300);

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
