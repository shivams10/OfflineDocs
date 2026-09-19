import type { TranscribeResponse } from "@docsync/shared";
import { API } from "@/constants/routes";
import { apiFetch } from "./client";

/** Sends one recorded chunk and returns its transcript. Network-only by design. */
export async function transcribeAudio(docId: string, audio: Blob): Promise<string> {
  // FormData, not a JSON body: the browser sets the multipart boundary itself.
  // It is also safe for apiFetch to replay after a token refresh.
  const body = new FormData();
  body.append("audio", audio, "dictation");

  const response = await apiFetch(API.docTranscribe(docId), { method: "POST", body });
  const { transcript } = (await response.json()) as TranscribeResponse;
  return transcript;
}
