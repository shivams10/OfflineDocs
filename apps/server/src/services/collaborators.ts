import type {
  AssignableCollaboratorRole,
  CollaboratorRole,
} from "@docsync/shared";
import { prisma } from "../db/client.js";
import { AppError } from "../lib/http-error.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { UserModel } from "../generated/prisma/models.js";

const USER_FIELDS = {
  avatarUrl: true,
  email: true,
  name: true,
} as const;

export type CollaboratorUser = Pick<UserModel, keyof typeof USER_FIELDS>;

export interface DocCollaboratorRow {
  userId: string;
  role: CollaboratorRole;
  user: CollaboratorUser;
}

export async function listCollaborators(
  docId: string,
): Promise<DocCollaboratorRow[]> {
  return prisma.docCollaborator.findMany({
    where: { docId },
    select: {
      userId: true,
      role: true,
      user: {
        select: USER_FIELDS,
      },
    },
  });
}

export async function inviteCollaborator(
  docId: string,
  email: string,
  role: AssignableCollaboratorRole,
): Promise<DocCollaboratorRow> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!user) {
    throw AppError.notFound(
      "No account found for that email",
      "invite_user_not_found",
    );
  }

  const existing = await prisma.docCollaborator.findUnique({
    where: { docId_userId: { docId, userId: user.id } },
  });

  if (existing) {
    throw AppError.conflict(
      "This user is already a collaborator on this document",
      "already_collaborator",
      { role: existing.role },
    );
  }

  return prisma.docCollaborator.create({
    data: { docId, userId: user.id, role },
    select: {
      userId: true,
      role: true,
      user: { select: USER_FIELDS },
    },
  });
}

/**
 * The last-owner rule for demoting or removing `targetUserId`.
 *
 * The document's owner rows are locked before anything is counted, so the rule holds
 * under concurrency: two requests each demoting one of two owners queue here, and the
 * second re-reads the owner set after the first commits instead of both seeing two
 * owners and both going through.
 */
async function assertLeavesAnOwner(
  tx: Prisma.TransactionClient,
  docId: string,
  targetUserId: string,
  lastOwnerMessage: string,
): Promise<void> {
  const owners = await tx.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "DocCollaborator"
    WHERE "docId" = ${docId} AND "role" = 'owner'
    FOR UPDATE
  `;

  const target = await tx.docCollaborator.findUnique({
    where: { docId_userId: { docId, userId: targetUserId } },
    select: { role: true },
  });

  if (!target) throw AppError.notFound("Collaborator not found");

  if (target.role === "owner" && owners.length <= 1) {
    throw AppError.badRequest(lastOwnerMessage, undefined, "last_owner");
  }
}

export async function changeRole(
  docId: string,
  targetUserId: string,
  newRole: AssignableCollaboratorRole,
): Promise<DocCollaboratorRow> {
  return prisma.$transaction(async (tx) => {
    await assertLeavesAnOwner(
      tx,
      docId,
      targetUserId,
      "Cannot change role : this is the last owner",
    );

    return tx.docCollaborator.update({
      where: { docId_userId: { docId, userId: targetUserId } },
      data: {
        role: newRole,
      },
      select: {
        userId: true,
        role: true,
        user: { select: USER_FIELDS },
      },
    });
  });
}

export async function removeCollaborator(
  docId: string,
  targetUserId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertLeavesAnOwner(tx, docId, targetUserId, "Cannot delete this owner");

    await tx.docCollaborator.delete({
      where: {
        docId_userId: { docId, userId: targetUserId },
      },
    });
  });
}
