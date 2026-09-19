"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_ERROR_CODES } from "@/constants/errors";
import { ApiError, csrfToken } from "@/lib/api/client";
import { transcribeAudio } from "@/lib/api/dictation";
import {
  deleteQueued,
  enqueueAudio,
  readPayload,
  readQueue,
} from "@/lib/offline/save-queue";
import {
  appendTranscript,
  joinTranscript,
  readTranscript,
  writeTranscript,
} from "@/lib/dictation/transcript-store";

/** The STT service runs one transcription at a time; others may be ahead of us. */
const BUSY_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

const STT_BUSY = "stt_busy";

export interface FailedRecording {
  audio: Blob;
  /** API error code, or undefined for a network failure. */
  code: string | undefined;
}

export interface Dictation {
  transcript: string;
  setTranscript: (text: string) => void;
  /** False until the saved transcript has been read back. */
  loaded: boolean;
  /** Recordings sent or waiting to be sent. */
  pendingCount: number;
  /** Recordings that failed, kept in memory so they can be retried. */
  failed: FailedRecording[];
  transcribe: (audio: Blob) => void;
  retryFailed: () => void;
  discardFailed: () => void;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeWithRetry(docId: string, audio: Blob): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await transcribeAudio(docId, audio);
    } catch (error) {
      const delay = BUSY_RETRY_DELAYS_MS[attempt];
      const busy = error instanceof ApiError && error.code === STT_BUSY;
      if (!busy || delay === undefined) throw error;
      await wait(delay);
    }
  }
}

/**
 * The dictation panel's state for one document.
 *
 * Recordings are sent one after another, never in parallel: results land in the
 * order they were spoken, and our own second chunk never collides with our first
 * in the single-slot STT service.
 *
 * A transcript that arrives after this hook unmounts (the user navigated away)
 * is written straight to IndexedDB, so it's there on the next visit.
 */
export function useDictation(docId: string): Dictation {
  const [transcript, setTranscript] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failed, setFailed] = useState<FailedRecording[]>([]);

  const mountedRef = useRef(true);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readTranscript(docId)
      .catch(() => "")
      .then((saved) => {
        if (cancelled) return;
        setTranscript(saved);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // Persist after load only, so the initial "" never overwrites a saved transcript.
  useEffect(() => {
    if (!loaded) return;
    void writeTranscript(docId, transcript).catch(() => undefined);
  }, [docId, loaded, transcript]);

  /**
   * Holds a recording made with no network until there is one (Phase 4.2). Raw
   * audio is never discarded because the network was down; if the device cannot
   * store it, that is said plainly rather than swallowed.
   */
  const queueAudio = useCallback(
    async (audio: Blob) => {
      const result = await enqueueAudio({ docId, audio, csrf: csrfToken() });
      if (!result.ok && mountedRef.current) {
        setFailed((current) => [...current, { audio, code: `queue_${result.reason}` }]);
      }
    },
    [docId],
  );

  const transcribe = useCallback(
    (audio: Blob) => {
      // No point sending into a void: queue it and let the reconnect flush it.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        void queueAudio(audio);
        return;
      }

      setPendingCount((count) => count + 1);

      queueRef.current = queueRef.current
        .then(() => transcribeWithRetry(docId, audio))
        .then(
          (text) => {
            if (mountedRef.current) {
              setTranscript((current) => joinTranscript(current, text));
            } else {
              void appendTranscript(docId, text).catch(() => undefined);
            }
          },
          (error: unknown) => {
            /* navigator.onLine reports true on a dead network, so a transport
               failure is the real signal that there is nothing to send to.
               Queue it rather than calling it a failure the user must retry. */
            if (!(error instanceof ApiError)) {
              void queueAudio(audio);
              return;
            }
            if (!mountedRef.current) return;
            // An expired session is handled by the app's auth flow, not here.
            if (error.code === API_ERROR_CODES.unauthorized) return;
            setFailed((current) => [...current, { audio, code: error.code }]);
          },
        )
        .finally(() => {
          if (mountedRef.current) setPendingCount((count) => count - 1);
        });
    },
    [docId, queueAudio],
  );

  /**
   * Sends recordings that were made offline, oldest first, and deletes each one
   * as soon as its transcript is in hand — the transcript is the part with value
   * (§Phase 4.2). Runs on reconnect and on mount, because the recording may have
   * been queued in a session that has since been closed.
   */
  const flushQueuedAudio = useCallback(async () => {
    const mine = (await readQueue().catch(() => [])).filter(
      (entry) => entry.docId === docId && entry.kind === "audio" && entry.state !== "rejected",
    );

    for (const entry of mine) {
      const payload = await readPayload(entry.id).catch(() => undefined);
      if (!payload?.audio) {
        // Nothing left to send; keeping it would only inflate the count.
        await deleteQueued(entry.id).catch(() => undefined);
        continue;
      }

      try {
        const text = await transcribeWithRetry(docId, payload.audio);
        if (mountedRef.current) setTranscript((current) => joinTranscript(current, text));
        else await appendTranscript(docId, text).catch(() => undefined);
        await deleteQueued(entry.id).catch(() => undefined);
      } catch (error) {
        // Still no network: leave it queued for the next attempt. A real refusal
        // from the server is kept too — dropping the audio is never our call.
        if (!(error instanceof ApiError)) return;
        return;
      }
    }
  }, [docId]);

  useEffect(() => {
    // Deferred rather than called in the effect body: the flush sets state as
    // each transcript lands, and starting it during the commit would cascade.
    queueMicrotask(() => void flushQueuedAudio());
    const onOnline = () => void flushQueuedAudio();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueuedAudio]);

  const retryFailed = useCallback(() => {
    setFailed([]);
    failed.forEach(({ audio }) => transcribe(audio));
  }, [failed, transcribe]);

  const discardFailed = useCallback(() => setFailed([]), []);

  return {
    transcript,
    setTranscript,
    loaded,
    pendingCount,
    failed,
    transcribe,
    retryFailed,
    discardFailed,
  };
}
