import { z } from "zod";
import { env, STT_TIMEOUT_MS } from "../config/env.js";
import { AppError } from "../lib/http-error.js";

const transcriptSchema = z.object({ transcript: z.string() });
const sttErrorSchema = z.object({ error: z.object({ code: z.string() }) });

function unavailable(): AppError {
  return AppError.serviceUnavailable("Transcription is unavailable right now", "stt_unavailable");
}

/**
 * The STT service's statuses, re-issued as our own errors. Only the ones a
 * client can act on pass through; anything else is our fault, not theirs, and
 * collapses to "unavailable" so the service's internals never reach a response.
 */
function toAppError(status: number, code: string | undefined): AppError {
  switch (code) {
    case "stt_busy":
      return AppError.serviceUnavailable("Transcription is busy, try again shortly", "stt_busy");
    case "audio_too_long":
      return AppError.payloadTooLarge("Audio is longer than 60 seconds", "audio_too_long");
    case "audio_unreadable":
      return AppError.unprocessable("The audio could not be decoded", "audio_unreadable");
    case "unsupported_audio_type":
      return AppError.unsupportedMediaType("Audio must be WebM or Ogg", "unsupported_audio_type");
    default:
      console.error(`STT service returned an unexpected ${status}`);
      return unavailable();
  }
}

/**
 * Forwards one audio chunk to the internal faster-whisper service. Holds no
 * copy of the audio beyond this call, and never logs it or the transcript.
 */
export async function transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: mimeType }), "dictation");

  let response: Response;
  try {
    response = await fetch(`${env.STT_URL}/transcribe`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
  } catch (error) {
    // Service down, or timed out.
    console.error("STT service unreachable:", error instanceof Error ? error.name : error);
    throw unavailable();
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw toAppError(response.status, sttErrorSchema.safeParse(body).data?.error.code);
  }

  const parsed = transcriptSchema.safeParse(body);
  if (!parsed.success) {
    console.error("STT service returned a malformed body");
    throw unavailable();
  }
  return parsed.data.transcript;
}
