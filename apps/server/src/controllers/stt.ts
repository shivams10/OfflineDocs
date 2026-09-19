import type { Request, Response } from "express";
import type { TranscribeResponse } from "@docsync/shared";
import { AppError } from "../lib/http-error.js";
import { transcribeAudio } from "../services/stt.js";

/**
 * Transcribes one dictation chunk. The transcript only goes back to the caller's
 * panel — nothing touches the document until they choose to insert it.
 */
export async function transcribe(
  req: Request,
  res: Response<TranscribeResponse>,
): Promise<void> {
  const { file } = req;
  if (!file?.size) {
    throw AppError.badRequest("No audio was sent", undefined, "audio_missing");
  }

  const transcript = await transcribeAudio(file.buffer, file.mimetype);
  res.json({ transcript });
}
