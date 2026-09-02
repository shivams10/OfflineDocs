export type CollaboratorRole = "owner" | "editor" | "viewer";

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
