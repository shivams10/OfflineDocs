"use client";

import { useSyncExternalStore } from "react";
import {
  getQueueServerSnapshot,
  getQueueSnapshot,
  queueIndex,
  queueTotals,
  subscribeQueue,
  type QueueTotals,
} from "@/lib/offline/save-queue";

export interface DocQueueState {
  /** Saves waiting to reach the server. */
  pending: number;
  /** Saves the server refused — kept until the user decides what to do. */
  rejected: number;
  /** Recordings waiting to be transcribed (Phase 4.2). */
  audio: number;
}

/** The whole queue's snapshot, shared by every consumer of this hook. */
function useQueueEntries() {
  return useSyncExternalStore(subscribeQueue, getQueueSnapshot, getQueueServerSnapshot);
}

export function useDocQueueState(docId: string): DocQueueState {
  const index = queueIndex(useQueueEntries());

  return {
    pending: index.pendingByDoc.get(docId) ?? 0,
    rejected: index.rejectedByDoc.get(docId) ?? 0,
    audio: index.audioByDoc.get(docId) ?? 0,
  };
}

/** Pending saves per document, for the dashboard's rows. */
export function usePendingByDoc(): ReadonlyMap<string, number> {
  return queueIndex(useQueueEntries()).pendingByDoc;
}

/**
 * How full and how old the queue is. Drives the "nearly full" and the seven-day
 * warnings — the two moments where the browser, not the user, becomes the threat
 * to unsynced work (§16.2).
 */
export function useQueueTotals(): QueueTotals {
  return queueTotals(useQueueEntries());
}
