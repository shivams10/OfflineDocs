import webpush, { WebPushError } from "web-push";
import type { PushPayload, PushSubscriptionRequest } from "@docsync/shared";
import { prisma } from "../db/client.js";
import { PUSH_DEBOUNCE_MS, vapid } from "../config/env.js";

/**
 * Configured once at module load. When VAPID keys are absent push is *off*, not
 * broken: every entry point below degrades to a no-op so a developer without keys
 * gets a working app with no notifications, rather than a save endpoint that 500s.
 */
if (vapid) {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
}

export function isPushConfigured(): boolean {
  return vapid !== null;
}

export function vapidPublicKey(): string | null {
  return vapid?.publicKey ?? null;
}

export async function saveSubscription(
  userId: string,
  subscription: PushSubscriptionRequest,
): Promise<void> {
  const { endpoint, keys } = subscription;

  // Endpoint is unique across users: the same browser profile re-subscribing after
  // a different sign-in must move to the new user, not collide or duplicate.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}

export async function removeSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  // Scoped to the caller: knowing an endpoint string must not let you unsubscribe
  // somebody else's device.
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/**
 * A save that has already been merged, waiting out its debounce window.
 *
 * The pending entry keeps the *latest* editor and summary rather than the first:
 * if two saves land 2s apart, the notification that eventually fires should
 * describe where the document ended up, not where it was halfway through.
 */
interface PendingNotification {
  timer: NodeJS.Timeout;
  editorId: string;
  editorName: string;
  docTitle: string;
  changeSummary: string;
}

const pending = new Map<string, PendingNotification>();

/**
 * Queues a notification for a saved document, collapsing a burst of saves into one.
 *
 * In-memory and therefore per-instance: two API instances would each debounce their
 * own traffic and could send two notifications for one burst. That is an acceptable
 * MVP trade (techspec 6 puts no shared store in scope) and the failure mode is a
 * duplicate buzz, not a lost or wrong notification.
 */
export function queueDocSavedNotification(input: {
  docId: string;
  docTitle: string;
  editorId: string;
  editorName: string;
  changeSummary: string;
}): void {
  if (!isPushConfigured()) return;

  const { docId, ...rest } = input;
  const existing = pending.get(docId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    const entry = pending.get(docId);
    pending.delete(docId);
    if (!entry) return;

    void sendDocSavedNotification(docId, entry).catch((error: unknown) => {
      console.error("push: failed to notify collaborators", { docId, error });
    });
  }, PUSH_DEBOUNCE_MS);

  // Never hold the process open for a pending notification — a shutting-down
  // server should exit, not linger for a buzz nobody is waiting on.
  timer.unref?.();

  pending.set(docId, { timer, ...rest });
}

async function sendDocSavedNotification(
  docId: string,
  entry: PendingNotification,
): Promise<void> {
  // Everyone with any role on the document except the person who saved it. Role is
  // read now rather than when the save landed, so someone removed during the
  // debounce window is correctly left out.
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      user: {
        collaborations: { some: { docId } },
        id: { not: entry.editorId },
      },
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return;

  const payload: PushPayload = {
    docId,
    docTitle: entry.docTitle,
    editorName: entry.editorName,
    changeSummary: entry.changeSummary,
  };
  const body = JSON.stringify(payload);

  // Independent sends: one dead endpoint must not stop the rest going out.
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
      ),
    ),
  );

  const gone = results.flatMap((result, index) => {
    if (result.status !== "rejected") return [];
    const reason: unknown = result.reason;
    // 404/410 is the push service telling us this endpoint is permanently dead —
    // the browser was uninstalled, or the user revoked permission. Anything else
    // (a timeout, a 5xx) may well work next time and is left alone.
    const isGone =
      reason instanceof WebPushError &&
      (reason.statusCode === 404 || reason.statusCode === 410);
    return isGone ? [subscriptions[index]!.id] : [];
  });

  if (gone.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  }
}

/** Test seam: clears anything waiting so a suite cannot leak timers between cases. */
export function resetPendingNotifications(): void {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
}
