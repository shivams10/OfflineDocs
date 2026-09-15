import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/require-role.js";
import { validate } from "../middleware/validate.js";
import * as presenceController from "../controllers/presence.js";
import { draftBackupSchema } from "../validators/presence.js";

/**
 * Both routers are gated at viewer and lean on `requireRole` for the 404/403 split,
 * so a heartbeat that lands after access was revoked returns the same "not found"
 * a stranger would get — which is what the client turns into "you no longer have
 * access" rather than failing silently (techspec 9).
 */

/** Mounted at `/docs/:id/draft`. */
export const draftRouter = Router({ mergeParams: true });

draftRouter.use(requireAuth);

draftRouter.post(
  "/",
  requireRole("viewer"),
  validate("body", draftBackupSchema),
  presenceController.heartbeat,
);

draftRouter.get("/", requireRole("viewer"), presenceController.draft);

/** Mounted at `/docs/:id/presence`. */
export const presenceRouter = Router({ mergeParams: true });

presenceRouter.use(requireAuth);

presenceRouter.get("/", requireRole("viewer"), presenceController.present);
