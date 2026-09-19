import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { STT_ALLOWED_AUDIO_TYPES, STT_MAX_AUDIO_BYTES } from "../config/env.js";
import { AppError } from "../lib/http-error.js";

const ALLOWED_TYPES: ReadonlySet<string> = new Set(STT_ALLOWED_AUDIO_TYPES);

/** `audio/webm;codecs=opus` -> `audio/webm`. */
function baseMediaType(mimeType: string): string {
  return mimeType.split(";")[0]!.trim().toLowerCase();
}

// Memory storage: dictation audio is never written to disk (spec §16.1). The
// buffer is dropped when the request ends.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: STT_MAX_AUDIO_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.has(baseMediaType(file.mimetype))) {
      cb(AppError.unsupportedMediaType("Audio must be WebM or Ogg", "unsupported_audio_type"));
      return;
    }
    cb(null, true);
  },
}).single("audio");

/**
 * Parses a single `audio` file field. Multer's own errors carry no HTTP status,
 * so they'd reach the error handler as a 500 — translated here instead.
 */
export function uploadAudio(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        error.code === "LIMIT_FILE_SIZE"
          ? AppError.payloadTooLarge("Audio is larger than 10 MB", "audio_too_large")
          : AppError.badRequest("Send exactly one file in the 'audio' field", undefined, "audio_missing"),
      );
      return;
    }
    next(error);
  });
}
