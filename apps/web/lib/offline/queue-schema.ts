/** Shared by the page and the service worker, which both open this database. */

export const QUEUE_DB_NAME = "docsync-save-queue";
export const QUEUE_DB_VERSION = 1;

/** Entry metadata, read often — counts, badges, replay order. */
export const QUEUE_STORE = "entries";
/** The update itself, read only when an entry is actually sent. */
export const PAYLOAD_STORE = "payloads";

/** Carries queue changes between tabs. */
export const QUEUE_CHANNEL = "docsync-save-queue";

export type QueuedSaveState = "queued" | "sending" | "rejected";

export interface QueuedSave {
  id: string;
  docId: string;
  /** Payload size, for the §16.2 caps. */
  bytes: number;
  queuedAt: number;
  state: QueuedSaveState;
  attempts: number;
}

export interface QueuedPayload {
  id: string;
  /** Base64 Yjs update, exactly as POST /docs/:id/save expects it. */
  update: string;
  /* Captured at enqueue: the worker sends this request later and cannot read
     document.cookie, where the CSRF token lives. */
  csrf: string | null;
}
