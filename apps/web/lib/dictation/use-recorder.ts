"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicErrorCode } from "@/constants/errors";

/** Matches the STT service's 60 s cap. Recording stops itself here. */
export const MAX_RECORDING_MS = 60_000;

/** The only formats the API accepts, in order of preference. */
const SUPPORTED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"] as const;

export type RecorderStatus = "idle" | "requesting" | "recording";

export interface Recorder {
  status: RecorderStatus;
  error: MicErrorCode | null;
  /** 0–1 input level while recording, for the meter. */
  level: number;
  elapsedMs: number;
  start: () => Promise<void>;
  /** Stops and hands the audio to `onRecorded`. A no-op when not recording. */
  stop: () => void;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return SUPPORTED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function toMicError(error: unknown): MicErrorCode {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_microphone";
  return "failed";
}

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  audioContext: AudioContext | null;
  frame: number | null;
  ticker: ReturnType<typeof setInterval>;
  limit: ReturnType<typeof setTimeout>;
}

/**
 * One recording at a time. The microphone is only requested on an explicit
 * `start()`, and every track is released as soon as recording stops — the
 * browser's "mic in use" indicator should never outlive the recording.
 *
 * Unmounting mid-recording still delivers the audio to `onRecorded`, so the
 * caller decides whether it is kept.
 */
export function useRecorder(onRecorded: (audio: Blob) => void): Recorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<MicErrorCode | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const sessionRef = useRef<Session | null>(null);
  const startingRef = useRef(false);
  /** Set by a stop() that arrives while the permission prompt is still open. */
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  // Latest callback without re-creating start/stop on every render.
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  });

  const release = useCallback((session: Session) => {
    clearInterval(session.ticker);
    clearTimeout(session.limit);
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.stream.getTracks().forEach((track) => track.stop());
    void session.audioContext?.close().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      if (startingRef.current) cancelledRef.current = true;
      return;
    }
    sessionRef.current = null;
    // `onstop` delivers the audio; tracks are released there, after the final chunk.
    if (session.recorder.state !== "inactive") session.recorder.stop();
    else release(session);
  }, [release]);

  const start = useCallback(async () => {
    if (sessionRef.current || startingRef.current) return;

    const mimeType = pickMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }

    startingRef.current = true;
    cancelledRef.current = false;
    setError(null);
    setStatus("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      startingRef.current = false;
      if (mountedRef.current) {
        setError(toMicError(cause));
        setStatus("idle");
      }
      return;
    }

    // Stopped or unmounted while the permission prompt was open: don't start a
    // recording nobody asked for any more.
    if (!mountedRef.current || cancelledRef.current) {
      startingRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) setStatus("idle");
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      startingRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      setError("unsupported");
      setStatus("idle");
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = Date.now();

    const session: Session = {
      stream,
      recorder,
      audioContext: null,
      frame: null,
      ticker: setInterval(() => {
        if (mountedRef.current) setElapsedMs(Date.now() - startedAt);
      }, 250),
      limit: setTimeout(stop, MAX_RECORDING_MS),
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      release(session);
      if (mountedRef.current) {
        setStatus("idle");
        setLevel(0);
        setElapsedMs(0);
      }
      const audio = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (audio.size > 0) onRecordedRef.current(audio);
    };

    // The meter is a nicety — a browser without Web Audio still records.
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        // RMS of speech sits low; scale it so normal talking fills most of the bar.
        if (mountedRef.current) setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        session.frame = requestAnimationFrame(tick);
      };
      session.audioContext = audioContext;
      session.frame = requestAnimationFrame(tick);
    } catch {
      session.audioContext = null;
    }

    sessionRef.current = session;
    startingRef.current = false;
    recorder.start();
    setElapsedMs(0);
    setStatus("recording");
  }, [release, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  return { status, error, level, elapsedMs, start, stop };
}
