import { prisma } from "../db/client.js";
import { AppError } from "../lib/http-error.js";
import type { CollaboratorRole } from "@docsync/shared";
import type { DocModel, UserModel } from "../generated/prisma/models.js";

const COLLABORATOR_USER_FIELDS = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

export type CollaboratorUser = Pick<
  UserModel,
  keyof typeof COLLABORATOR_USER_FIELDS
>;

const DOC_SUMMARY_FIELDS = {
  id: true,
  title: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  collaborators: { select: { user: { select: COLLABORATOR_USER_FIELDS } } },
} as const;

export interface DocSummaryRecord extends Pick<
  DocModel,
  "id" | "title" | "ownerId" | "createdAt" | "updatedAt"
> {
  collaborators: { user: CollaboratorUser }[];
}

export interface DocAccessRow {
  role: CollaboratorRole;
  doc: DocSummaryRecord;
}

export async function listDocsForUser(userId: string): Promise<DocAccessRow[]> {
  return prisma.docCollaborator.findMany({
    where: { userId },
    select: {
      role: true,
      doc: { select: DOC_SUMMARY_FIELDS },
    },
    orderBy: { doc: { updatedAt: "desc" } },
  });
}

const DEFAULT_DOC_TITLE = "Untitled document";

export interface CreateDocInput {
  ownerId: string;
  title?: string;
}

// Nested create: Prisma runs the Doc + owner DocCollaborator insert as one
// engine-level transaction, so no explicit $transaction is needed here.
export async function createDoc(input: CreateDocInput): Promise<DocAccessRow> {
  const doc = await prisma.doc.create({
    data: {
      title: input.title ?? DEFAULT_DOC_TITLE,
      ownerId: input.ownerId,
      collaborators: { create: { userId: input.ownerId, role: "owner" } },
    },
    select: DOC_SUMMARY_FIELDS,
  });

  return { role: "owner", doc };
}

const DOC_DETAIL_FIELDS = {
  id: true,
  title: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  snapshot: true,
} as const;

export type DocDetailRecord = Pick<
  DocModel,
  "id" | "title" | "ownerId" | "createdAt" | "updatedAt" | "snapshot"
>;

export async function getDocById(
  docId: string,
): Promise<DocDetailRecord | null> {
  return prisma.doc.findUnique({
    where: { id: docId },
    select: DOC_DETAIL_FIELDS,
  });
}

export async function renameDoc(docId: string, title: string): Promise<DocSummaryRecord> {
  return prisma.doc.update({
    where: { id: docId },
    data: { title },
    select: DOC_SUMMARY_FIELDS,
  });
}

export async function deleteDoc(docId: string): Promise<void> {
  await prisma.doc.delete({ where: { id: docId } });
}


export async function duplicateDoc(sourceDocId: string, callerId: string): Promise<DocAccessRow> {
  const source = await prisma.doc.findUnique({
    where: { id: sourceDocId },
    select: { title: true, snapshot: true },
  });
  if (!source) throw AppError.notFound("Document not found");

  const doc = await prisma.doc.create({
    data: {
      title: `${source.title} (copy)`,
      snapshot: source.snapshot,
      ownerId: callerId,
      collaborators: { create: { userId: callerId, role: "owner" } },
    },
    select: DOC_SUMMARY_FIELDS,
  });

  return { role: "owner", doc };
}
