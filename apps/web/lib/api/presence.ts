import type {
  DraftBackupRequest,
  DraftBackupResponse,
  DraftResponse,
  PresenceResponse,
  PresenceUser,
} from "@docsync/shared";
import { API } from "@/constants/routes";
import { apiGet, apiPost } from "./client";

/** One heartbeat: refreshes presence, and for editors replaces the draft backup. */
export async function sendHeartbeat(
  docId: string,
  body: DraftBackupRequest,
): Promise<DraftBackupResponse> {
  return apiPost<DraftBackupResponse>(API.docDraft(docId), body);
}

export async function fetchPresence(docId: string): Promise<PresenceUser[]> {
  const { present } = await apiGet<PresenceResponse>(API.docPresence(docId));
  return present;
}

export async function fetchOwnDraft(
  docId: string,
): Promise<DraftResponse["draft"]> {
  const { draft } = await apiGet<DraftResponse>(API.docDraft(docId));
  return draft;
}
