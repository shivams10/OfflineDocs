/** Every in-app path. Nothing should hardcode a route string. */
export const ROUTES = {
  home: "/",
  login: "/login",
  /** Where the API redirects the browser once it has set the session cookies. */
  authCallback: "/auth/callback",
  dashboard: "/dashboard",
  /** The design-system proof sheet. Temporary — see the note in its page. */
  design: "/design",
  doc: (id: string) => `/doc/${id}`,
} as const;

/** Backend endpoints, relative to NEXT_PUBLIC_API_ORIGIN. */
export const API = {
  me: "/auth/me",
  refresh: "/auth/refresh",
  logout: "/auth/logout",
  googleLogin: "/auth/google",
  docs: "/docs",
  doc: (id: string) => `/docs/${id}`,
  docDuplicate: (id: string) => `/docs/${id}/duplicate`,
  docCollaborators: (docId: string) => `/docs/${docId}/collaborators`,
  docCollaborator: (docId: string, userId: string) =>
    `/docs/${docId}/collaborators/${userId}`,
  docSave: (id: string) => `/docs/${id}/save`,
  /** POST = heartbeat (presence + draft backup); GET = read your own backup. */
  docDraft: (id: string) => `/docs/${id}/draft`,
  docPresence: (id: string) => `/docs/${id}/presence`,
  /** POST multipart `audio` — one dictation chunk, transcribed. Editor+. */
  docTranscribe: (id: string) => `/docs/${id}/transcribe`,
  pushVapidKey: "/push/vapid-public-key",
  pushSubscribe: "/push/subscribe",
} as const;
