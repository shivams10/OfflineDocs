import type { Request, Response } from "express";
import type {
  ChangeRoleRequest,
  CollaboratorResponse,
  CollaboratorsResponse,
  DocCollaboratorDto,
  InviteCollaboratorRequest,
} from "@docsync/shared";
import {
  changeRole,
  type DocCollaboratorRow,
  inviteCollaborator,
  listCollaborators,
  removeCollaborator,
} from "../services/collaborators.js";
import { getDocAccess } from "../middleware/require-role.js";
import { getAuthenticatedUser } from "../middleware/auth.js";
import { AppError } from "../lib/http-error.js";

/**
 * Only an owner sees email addresses. The list endpoint is viewer+, and on a document
 * shared between people who don't know each other, returning `email` to everyone
 * would hand every member's address to every other member.
 */
function toDocCollaboratorDto(
  row: DocCollaboratorRow,
  includeEmail: boolean,
): DocCollaboratorDto {
  const {
    userId,
    role,
    user: { name, email, avatarUrl },
  } = row;

  return {
    userId,
    name,
    email: includeEmail ? email : null,
    avatarUrl,
    role,
  };
}

export async function list(
  req: Request,
  res: Response<CollaboratorsResponse>,
): Promise<void> {
  const { docId, role } = getDocAccess(req);
  const includeEmail = role === "owner";
  const rows = await listCollaborators(docId);
  res.json({
    collaborators: rows.map((row) => toDocCollaboratorDto(row, includeEmail)),
  });
}

export async function invite(
  req: Request,
  res: Response<CollaboratorResponse>,
): Promise<void> {
  const { docId } = getDocAccess(req);
  const { email, role } = req.body as unknown as InviteCollaboratorRequest;
  const row = await inviteCollaborator(docId, email, role);
  // Owner-only route, so the caller is always allowed the address.
  res.status(201).json({
    collaborator: toDocCollaboratorDto(row, true),
  });
}

export async function changeRoleHandler(
  req: Request,
  res: Response<CollaboratorResponse>,
): Promise<void> {
  const { docId } = getDocAccess(req);
  const targetUserId = req.params.userId as string;
  const { role } = req.body as unknown as ChangeRoleRequest;
  const row = await changeRole(docId, targetUserId, role);
  // Owner-only route, so the caller is always allowed the address.
  res.json({ collaborator: toDocCollaboratorDto(row, true) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { docId, role } = getDocAccess(req);
  const targetUserId = req.params.userId as string;
  const { id: callerId } = getAuthenticatedUser(req);

  if (targetUserId !== callerId && role !== "owner") {
    throw AppError.forbidden("Only the owner can remove another collaborator");
  }

  await removeCollaborator(docId, targetUserId);
  res.status(204).send();
}
