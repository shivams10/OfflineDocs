export type CollaboratorRole = "owner" | "editor" | "viewer";
export type AssignableCollaboratorRole = Exclude<CollaboratorRole, "owner">;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export type CsrfHeaderName = "X-CSRF-Token";

export interface MeResponse {
  user: AuthUser;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Doc {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocCollaboratorSummary {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface DocSummary extends Doc {
  role: CollaboratorRole;
  collaborators: DocCollaboratorSummary[];
}

export interface DocDetail extends Doc {
  snapshot: string | null;
  role: CollaboratorRole;
}

export interface DocCollaboratorDto {
  userId: string;
  name: string | null;
  /** null unless the caller is an owner of the document — everyone else sees names only. */
  email: string | null;
  avatarUrl: string | null;
  role: CollaboratorRole;
}

export interface InviteCollaboratorRequest {
  email: string;
  role: AssignableCollaboratorRole;
}

export interface ChangeRoleRequest {
  role: AssignableCollaboratorRole;
}

export interface CreateDocRequest {
  title?: string;
}

export interface RenameDocRequest {
  title: string;
}

export interface DocsResponse {
  docs: DocSummary[];
}

export interface DocResponse {
  doc: DocSummary;
}

export interface DocDetailResponse {
  doc: DocDetail;
}

export interface CollaboratorsResponse {
  collaborators: DocCollaboratorDto[];
}

export interface CollaboratorResponse {
  collaborator: DocCollaboratorDto;
}

export interface SaveRequest {
  update: string;
}

export interface PushPayload {
  docId: string;
  docTitle: string;
  editorName: string;
  changeSummary: string;
}

/* ---------------------------------------------------------------- presence */

/** Someone currently holding the document open. Role travels with it so the UI
 *  can distinguish a viewer looking on from an editor who may be about to save. */
export interface PresenceUser {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: CollaboratorRole;
}

export interface PresenceResponse {
  /** Everyone present, the caller included — the caller is filtered client-side
   *  so the list stays a plain fact about the document rather than a per-caller view. */
  present: PresenceUser[];
}

/** One heartbeat: refreshes presence and, for editors, backs the draft up.
 *  `update` is a base64 Yjs update of the author's whole local state. Omitted by
 *  viewers, who have presence but no draft. */
export interface DraftBackupRequest {
  update?: string;
}

export interface DraftBackupResponse {
  /** Server clock, so a client can age its own backup without trusting the device clock. */
  backedUpAt: string | null;
}

export interface DraftResponse {
  draft: {
    update: string;
    backedUpAt: string;
  } | null;
}

/* -------------------------------------------------------------------- push */

/** The browser's PushSubscription, narrowed to what the server stores. */
export interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface VapidKeyResponse {
  /** null when the server has no VAPID keys configured — push is then off, not broken. */
  publicKey: string | null;
}

/* --------------------------------------------------------------- dictation */

/** `POST /docs/:id/transcribe` — one recorded chunk, transcribed. Goes to the
 *  caller's dictation panel only; nothing is written to the document. */
export interface TranscribeResponse {
  transcript: string;
}
