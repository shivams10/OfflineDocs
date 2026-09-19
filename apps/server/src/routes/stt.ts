import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/require-role.js";
import { uploadAudio } from "../middleware/upload-audio.js";
import * as sttController from "../controllers/stt.js";

/**
 * Mounted at `/docs/:id/transcribe`. Doc-scoped so `requireRole` gives the usual
 * 404/403 split. Editor+ only: a viewer has no dictation entry point (spec §16.1).
 *
 * The role check runs before the upload is parsed, so a viewer's or stranger's
 * audio is never read into memory.
 */
export const sttRouter = Router({ mergeParams: true });

sttRouter.use(requireAuth);

sttRouter.post("/", requireRole("editor"), uploadAudio, sttController.transcribe);
