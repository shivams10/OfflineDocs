import type { Request, Response } from "express";
import type {
  DraftBackupRequest,
  DraftBackupResponse,
  DraftResponse,
  PresenceResponse,
} from "@docsync/shared";
import { AppError } from "../lib/http-error.js";
import { getAuthenticatedUser } from "../middleware/auth.js";
import { getDocAccess } from "../middleware/require-role.js";
import {
  getOwnDraft,
  listPresent,
  recordHeartbeat,
  sweepStalePresence,
} from "../services/presence.js";

/**
 * The heartbeat. Gated at viewer, not editor, so a viewer appears in the presence
 * list — "who has this open" is about attention, not write access, and a reader
 * looking over your shoulder is exactly what the chips are for.
 *
 * A viewer sending an `update` is still rejected: they have no draft to back up,
 * and accepting the body would mean storing write-shaped data for a role that can
 * never save it.
 */
export async function heartbeat(
  req: Request,
  res: Response<DraftBackupResponse>,
): Promise<void> {
  const { docId, role } = getDocAccess(req);
  const { id: userId } = getAuthenticatedUser(req);
  const { update } = req.body as unknown as DraftBackupRequest;

  if (update !== undefined && role === "viewer") {
    throw AppError.forbidden("Viewers cannot back up a draft");
  }

  const backedUpAt = await recordHeartbeat(docId, userId, update);

  // Fire-and-forget: a failed sweep must not fail the caller's heartbeat, which is
  // the one thing this request actually promises.
  void sweepStalePresence().catch(() => undefined);

  res.json({ backedUpAt: backedUpAt?.toISOString() ?? null });
}

export async function present(
  req: Request,
  res: Response<PresenceResponse>,
): Promise<void> {
  const { docId } = getDocAccess(req);
  const rows = await listPresent(docId);

  res.json({
    present: rows.map(({ user, role }) => ({
      userId: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role,
    })),
  });
}

export async function draft(
  req: Request,
  res: Response<DraftResponse>,
): Promise<void> {
  const { docId } = getDocAccess(req);
  const { id: userId } = getAuthenticatedUser(req);

  const own = await getOwnDraft(docId, userId);

  res.json({
    draft: own
      ? { update: own.update, backedUpAt: own.backedUpAt.toISOString() }
      : null,
  });
}
