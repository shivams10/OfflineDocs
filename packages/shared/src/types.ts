export type CollaboratorRole = "owner" | "editor" | "viewer";

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

export interface DocMetadata {
  id: string;
  title: string;
  updatedAt: string;
}

export interface SaveRequest {
  docId: string;
  update: Uint8Array;
}

export interface PushPayload {
  docId: string;
  docTitle: string;
  editorName: string;
  changeSummary: string;
}
