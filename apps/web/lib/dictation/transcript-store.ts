/**
 * The dictation panel's scratch transcript, one entry per document, in IndexedDB.
 *
 * Deliberately *not* part of the Yjs doc: it is one user's uncommitted scratch,
 * and putting it in the CRDT would replicate a half-finished dictation to every
 * collaborator (spec Phase 4.1). Only audio-free text is stored here.
 */

const DB_NAME = "docsync-dictation";
const DB_VERSION = 1;
const STORE = "transcripts";

interface TranscriptRecord {
  docId: string;
  text: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "docId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => {
      // Let a later call try again rather than caching the failure forever.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readTranscript(docId: string): Promise<string> {
  const record = await withStore<TranscriptRecord | undefined>("readonly", (store) =>
    store.get(docId),
  );
  return record?.text ?? "";
}

/** An empty transcript deletes the entry rather than storing "". */
export async function writeTranscript(docId: string, text: string): Promise<void> {
  await withStore("readwrite", (store) => {
    if (text) {
      store.put({ docId, text, updatedAt: Date.now() } satisfies TranscriptRecord);
    } else {
      store.delete(docId);
    }
  });
}

/** Joins a new chunk onto an existing transcript with a single space. */
export function joinTranscript(existing: string, addition: string): string {
  const next = addition.trim();
  if (!next) return existing;
  if (!existing) return next;
  return /\s$/.test(existing) ? existing + next : `${existing} ${next}`;
}

/**
 * Read-modify-write inside one transaction, for a transcript that lands after
 * the panel's owner has unmounted — so the text still survives to the next visit.
 */
export async function appendTranscript(docId: string, addition: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(docId);
    get.onsuccess = () => {
      const current = (get.result as TranscriptRecord | undefined)?.text ?? "";
      const text = joinTranscript(current, addition);
      if (text) store.put({ docId, text, updatedAt: Date.now() } satisfies TranscriptRecord);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
