
export const BRAND = {
  name: "DocSync",
  monogram: "D",
} as const;

export const LOGIN_PITCH = {
  headline: "Write together, online or offline.",
  body:
    "DocSync keeps every document editable while you are offline and merges your changes " +
    "the moment you reconnect. One shared workspace, live presence on each document, and " +
    "a full version history behind every save.",
  bodyShort:
    "DocSync keeps every document editable while you are offline and merges your changes " +
    "the moment you reconnect. One shared workspace, live presence, and full version history.",
  features: ["Offline editing", "Live presence", "Version history"],
} as const;

export const LOGIN_FORM = {
  startPrefix: "Start",
  typedWords: ["writing", "drafting", "editing", "syncing"],
  needHelp: "Need help?",
  headline: "Welcome back to your desk",
  body:
    "Wherever you left off — a train, a flight, a dead zone — the edits you made there " +
    "are waiting to sync.",
  googleCta: "Continue with Google",
  googleCtaBusy: "Redirecting to Google…",
  workspaceNote: "Your workspace is created the first time you sign in.",
  legalPrefix: "By continuing you agree to the",
  legalTerms: "Terms",
  legalAnd: "and",
  legalPrivacy: "Privacy Policy",
  legalSuffix: ".",
} as const;

/** The static preview beside the form. Illustrative content, not live data. */
export const WORKSPACE_PREVIEW = {
  title: "Workspace preview",
  documents: [
    {
      id: "project-requirements",
      name: "Project Requirements",
      meta: "Edited 2 min ago · Maya, Dev",
      status: "synced",
      highlighted: true,
    },
    {
      id: "sprint-14-notes",
      name: "Sprint 14 Notes",
      meta: "Edited offline · 3 changes queued",
      status: "pending",
      highlighted: false,
    },
    {
      id: "design-handoff",
      name: "Design Handoff",
      meta: "Edited yesterday · 5 collaborators",
      status: "synced",
      highlighted: false,
    },
  ],
} as const;

export const DOC_STATUS_LABELS = {
  synced: "Synced",
  pending: "Pending",
} as const;

export const SESSION_LABELS = {
  checking: "Checking your session…",
  redirecting: "Taking you to sign in…",
  finishingSignIn: "Finishing sign-in…",
  signOut: "Sign out",
  signingOut: "Signing out…",
  retry: "Try again",
  unreachableTitle: "Could not reach the server",
} as const;

export const APP_SHELL_LABELS = {
  searchPlaceholder: "Search documents",
  newDocument: "New document",
  allDocuments: "All documents",
  sharedWithMe: "Shared with me",
  recent: "Recent",
  account: "Account",
  profile: "Profile",
  settings: "Settings",
  offlineTitle: "Offline ready",
  offlineBody: "Documents you open are kept on this device.",
} as const;

export const DOCUMENTS_PAGE_LABELS = {
  title: "All documents",
} as const;
