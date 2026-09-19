import type { CollaboratorRole } from "@docsync/shared";
import { prisma } from "../db/client.js";
import {
  PRESENCE_SWEEP_AFTER_SECONDS,
  PRESENCE_TTL_SECONDS,
} from "../config/env.js";
import type { UserModel } from "../generated/prisma/models.js";

const PRESENCE_USER_FIELDS = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

export type PresenceUserRecord = Pick<
  UserModel,
  keyof typeof PRESENCE_USER_FIELDS
>;

export interface PresenceRow {
  user: PresenceUserRecord;
  role: CollaboratorRole;
}

function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

/**
 * One heartbeat, two effects (techspec 7): it refreshes the caller's presence and,
 * when an editor sends one, replaces their private draft backup.
 *
 * The two writes are deliberately independent rather than one row. A viewer is
 * present but has no draft, and an editor whose draft write failed should still
 * show up as present — collapsing them into a single record would couple a
 * privacy-bearing blob to a liveness ping that fires every 25 seconds.
 */
export async function recordHeartbeat(
  docId: string,
  userId: string,
  update?: string,
): Promise<Date | null> {
  const now = new Date();

  // Not a transaction: presence and the draft are independent facts, and a failed
  // draft write should not roll back the caller's liveness.
  await prisma.docPresence.upsert({
    where: { docId_userId: { docId, userId } },
    create: { docId, userId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });

  if (update === undefined) return null;

  const draft = await prisma.docDraft.upsert({
    where: { docId_userId: { docId, userId } },
    create: { docId, userId, update: Buffer.from(update, "base64") },
    update: { update: Buffer.from(update, "base64") },
    select: { updatedAt: true },
  });

  return draft.updatedAt;
}

/**
 * Who is present right now. Anything older than the TTL is simply not returned —
 * there is no "leaving" signal to miss, so a crashed tab or a dropped connection
 * ages out on its own rather than leaving a ghost in the list.
 *
 * The caller is included. Filtering them out here would make the response a
 * per-caller view of a fact that is the same for everyone, and the editor top bar
 * is the only place that cares.
 */
export async function listPresent(docId: string): Promise<PresenceRow[]> {
  const rows = await prisma.docPresence.findMany({
    where: { docId, lastSeenAt: { gt: secondsAgo(PRESENCE_TTL_SECONDS) } },
    select: { userId: true, user: { select: PRESENCE_USER_FIELDS } },
    orderBy: { lastSeenAt: "desc" },
  });

  if (rows.length === 0) return [];

  // Presence rows survive a collaborator being removed (the FK is to User, not to
  // DocCollaborator), so role comes from the ACL at read time. Someone whose access
  // was revoked while the tab sat open has no row here and drops out of the list.
  const roles = await prisma.docCollaborator.findMany({
    where: { docId, userId: { in: rows.map((row) => row.userId) } },
    select: { userId: true, role: true },
  });
  const roleByUser = new Map(roles.map(({ userId, role }) => [userId, role]));

  return rows.flatMap((row) => {
    const role = roleByUser.get(row.userId);
    return role ? [{ user: row.user, role }] : [];
  });
}

/**
 * The caller's own draft backup, and only ever their own — this is keyed by
 * (docId, userId) at the query, not filtered after the fact, so there is no shape
 * of request that returns somebody else's unsaved work.
 */
export async function getOwnDraft(
  docId: string,
  userId: string,
): Promise<{ update: string; backedUpAt: Date } | null> {
  const draft = await prisma.docDraft.findUnique({
    where: { docId_userId: { docId, userId } },
    select: { update: true, updatedAt: true },
  });
  if (!draft) return null;

  return {
    update: Buffer.from(draft.update).toString("base64"),
    backedUpAt: draft.updatedAt,
  };
}

/**
 * Drops the caller's backup. Called on an explicit Save — once the content is in
 * the canonical document there is nothing left to recover, and keeping a stale
 * copy of text the user has since edited away is a liability, not a safety net.
 *
 * Tolerates the row being absent: a viewer, or an editor who saved without ever
 * having a backup written, is not an error.
 */
export async function clearOwnDraft(
  docId: string,
  userId: string,
): Promise<void> {
  await prisma.docDraft.deleteMany({ where: { docId, userId } });
}

/**
 * Opportunistic cleanup of rows far past any TTL. Called from the heartbeat rather
 * than a scheduled job: the table only grows when documents are being opened, so
 * the write path is exactly where the sweeping is worth doing, and there is no
 * timer to keep alive across restarts or duplicate across instances.
 */
export async function sweepStalePresence(): Promise<void> {
  await prisma.docPresence.deleteMany({
    where: { lastSeenAt: { lt: secondsAgo(PRESENCE_SWEEP_AFTER_SECONDS) } },
  });
}
