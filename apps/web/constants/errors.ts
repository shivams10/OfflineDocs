export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the Google sign-in. Nothing was changed.",
  provider_error: "Google rejected the sign-in request. Please try again.",
  invalid_oauth_state:
    "That sign-in attempt expired or could not be verified. Please start again.",
  provider_not_configured:
    "Google sign-in is not configured on this server yet.",
  oauth_exchange_failed:
    "We could not finish the exchange with Google. Please try again.",
  oauth_profile_failed:
    "We could not read your Google profile. Please try again.",
  email_not_verified:
    "Your Google email address is not verified. Verify it with Google, then sign in again.",
  email_already_registered:
    "Another DocSync account already uses this email address.",
  login_failed: "Something went wrong signing you in. Please try again.",
};

export const FALLBACK_AUTH_ERROR = AUTH_ERROR_MESSAGES.login_failed;

export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? FALLBACK_AUTH_ERROR;
}

/** Codes the API returns in a JSON body rather than a redirect. */
export const API_ERROR_CODES = {
  /** The access token aged out — refresh once and retry, do not send the user to login. */
  tokenExpired: "token_expired",
  unauthorized: "unauthorized",
  csrfInvalid: "csrf_token_invalid",
  refreshReused: "refresh_token_reused",
  refreshExpired: "refresh_token_expired",
} as const;

export const NETWORK_ERROR_MESSAGE =
  "Could not reach the server. Check your connection and try again.";

export const DOC_ERROR_MESSAGES: Record<string, string> = {
  not_found: "This document is no longer available. Try refreshing the list.",
  forbidden: "You do not have access to do that.",
  bad_request: "That title isn't valid. Please enter a non-empty title.",
  invite_user_not_found: "No DocSync account uses that email address.",
  already_collaborator: "This person already has access to this document.",
  last_owner: "This document needs at least one owner.",
};

export const FALLBACK_DOC_ERROR = "Something went wrong. Please try again.";

export function docErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return DOC_ERROR_MESSAGES[code] ?? FALLBACK_DOC_ERROR;
}

/** Microphone problems, raised in the browser before anything is sent. */
export const MIC_ERROR_MESSAGES = {
  permission_denied:
    "Microphone access is blocked. Allow it in your browser's site settings to dictate.",
  no_microphone: "No microphone was found. Connect one and try again.",
  unsupported: "This browser can't record audio for dictation.",
  failed: "Couldn't start the microphone. Try again.",
} as const;

export type MicErrorCode = keyof typeof MIC_ERROR_MESSAGES;

/** Codes from `POST /docs/:id/transcribe`. */
export const TRANSCRIBE_ERROR_MESSAGES: Record<string, string> = {
  stt_busy: "Transcription is busy right now. Try again in a moment.",
  stt_unavailable: "Transcription is unavailable right now. Try again later.",
  audio_too_large: "That recording is too large to transcribe.",
  audio_too_long: "That recording is longer than a minute.",
  audio_unreadable: "That recording couldn't be read. Try recording again.",
  unsupported_audio_type: "This browser records audio in a format we can't transcribe.",
  forbidden: "You no longer have permission to dictate in this document.",
  not_found: "This document is no longer available.",
};

export const FALLBACK_TRANSCRIBE_ERROR = "Couldn't transcribe that recording. Try again.";

export function transcribeErrorMessage(code: string | undefined): string {
  return (code && TRANSCRIBE_ERROR_MESSAGES[code]) || FALLBACK_TRANSCRIBE_ERROR;
}
