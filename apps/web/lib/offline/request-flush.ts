"use client";

/** Must match the tag public/sw.js listens for. */
const SYNC_TAG = "docsync-save-queue";

interface SyncManager {
  register: (tag: string) => Promise<void>;
}

/**
 * Asks for the queue to be sent. Background Sync survives the tab closing and
 * fires on its own once connectivity returns; the message does neither, but is
 * all Firefox and Safari offer. Both run the same drain inside the worker.
 */
export async function requestQueueFlush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;

    if ("sync" in registration) {
      try {
        await (registration as ServiceWorkerRegistration & { sync: SyncManager }).sync.register(
          SYNC_TAG,
        );
        return;
      } catch {
        // Denied, or too many registrations — fall through to the message.
      }
    }

    registration.active?.postMessage({ type: "FLUSH_QUEUE" });
  } catch (error) {
    console.warn("[pwa] could not ask for a queue flush", error);
  }
}
