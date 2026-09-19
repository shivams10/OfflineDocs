"use client";

import { useSyncExternalStore } from "react";
import {
  getQueueServerSnapshot,
  getQueueSnapshot,
  queueIndex,
  subscribeQueue,
} from "@/lib/offline/save-queue";

export interface DocQueueState {
  /** Saves waiting to reach the server. */
  pending: number;
  /** Saves the server refused — kept until the user decides what to do. */
  rejected: number;
}

export function useDocQueueState(docId: string): DocQueueState {
  const entries = useSyncExternalStore(subscribeQueue, getQueueSnapshot, getQueueServerSnapshot);
  const index = queueIndex(entries);

  return {
    pending: index.pendingByDoc.get(docId) ?? 0,
    rejected: index.rejectedByDoc.get(docId) ?? 0,
  };
}
