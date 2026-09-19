"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_ERROR_CODES } from "@/constants/errors";
import { ApiError } from "@/lib/api/client";
import { transcribeAudio } from "@/lib/api/dictation";
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

  const transcribe = useCallback(
    (audio: Blob) => {
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
            if (!mountedRef.current) return;
            const code = error instanceof ApiError ? error.code : undefined;
            // An expired session is handled by the app's auth flow, not here.
            if (code === API_ERROR_CODES.unauthorized) return;
            setFailed((current) => [...current, { audio, code }]);
          },
        )
        .finally(() => {
          if (mountedRef.current) setPendingCount((count) => count - 1);
        });
    },
    [docId],
  );

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
