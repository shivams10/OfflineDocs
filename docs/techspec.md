# DocSync — Technical Specification

**Status:** Draft
**Owner:** Shivam
**Last updated:** September 2026
**Product reference:** `DocSync-PRD.md` — reconciled in Section 16. Where this spec and the
PRD disagree, Section 16 lists the conflict rather than silently picking a side.
**Design reference:** [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) — the implemented token
contract. `DocSync UI.dc.html` / `DocSync Wireframes.dc.html` are design sources, not code.

---

## 1. Overview

DocSync is an offline-capable, multi-user document editor. Multiple users can read and edit the same document, with edits kept as a local, explicit **draft** until the editor clicks **Save** — at which point the change is merged into the canonical document and collaborators are notified via push. Speech-to-text (Whisper) is available as a secondary input method.

There is no persistent real-time transport (no WebSocket relay, no live cursors/presence) — collaboration happens asynchronously through save-and-merge plus push notifications, not a continuously streamed session. The PRD's phrase "live presence" is read as *current* presence, served by the poll in Section 7, not a streamed connection; see Section 16 if that reading is wrong.

Authentication is **Google OAuth only** — no email/password, no other provider, no separate sign-up. A first sign-in creates the workspace implicitly.

This spec covers architecture, data flow, and implementation details for a functional demo/MVP suitable for internal use or a technical brown bag.

### 1.1 Goals
- Multi-user document editing with conflict-free merging at save time
- Explicit draft/save model — edits are local until the editor clicks Save
- Full offline read/write support — no degraded experience without network
- Push notifications for document updates, including when the app is fully closed
- Speech-to-text capture via self-hosted `faster-whisper`, reviewed and inserted manually (not auto-committed), with offline audio cached and auto-transcribed on reconnect (the offline part is Phase 4.2, not built)
- Per-document collaborator permissions (Owner/Editor/Viewer) — see Section 8
- Serve as a reference implementation of PWA primitives: service workers, caching strategies, background sync, push
- Sync state legible at every point a user might worry: dashboard row, editor top bar, pending-change count (PRD §3)
- Sign-in is a single action — one button, no credential management for user or team (PRD §3)
- Feature parity across 1440 / 768 / 390, light and dark: layout adapts, features are not removed (PRD §3)

### 1.2 Non-goals (MVP)
- Real-time/live collaboration (live cursors, streamed keystrokes) — superseded by the draft + Save model. A lightweight, non-realtime presence indicator ("Priya has this doc open") is in scope — see Section 7 — but live cursors/typing are not
- Rich media embeds (images, tables, attachments) — text-only documents for v1
- Mobile native app — PWA only, installable via browser
- Comments and suggestion mode (PRD §3)
- Folders, tags, or search beyond the document list (PRD §3)
- Public/anonymous document links beyond the share panel's link-access section (PRD §3)
- Email/password auth, non-Google SSO, account recovery (PRD §3)
- Manual conflict-resolution UI — merge is automatic (PRD §3, and Section 9 here)
- ~~Version history / rollback UI~~ — **contested.** The PRD sells "full version history behind
  every save" in its summary, goals, and the sign-in screen copy, while this spec listed it as a
  non-goal. PRD §13 Q3 then asks whether restore is even in scope. Unresolved — Section 16

---

## 2. Architecture overview

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (React) | PWA via custom service worker (not next-pwa, for full control over caching/push logic) |
| Merge/sync model | Yjs (CRDT) | CRDT resolves concurrent/offline edits deterministically; applied at Save time rather than streamed continuously |
| Local persistence | IndexedDB (via y-indexeddb) | Local draft state and offline source of truth; also stores STT panel scratch data |
| Speech-to-text | Self-hosted `faster-whisper` (Python + FastAPI, `apps/stt`) | Proxied by the Node API at `POST /docs/:id/transcribe`; audio never leaves our infrastructure. Replaced the originally planned cloud Whisper API — master spec §16.1 |
| Save transport | HTTP (REST) | Client POSTs its Yjs update to the backend when the editor clicks Save; no persistent connection |
| Push | Web Push API (VAPID) | Triggered server-side immediately after a Save request is persisted |
| Backend | Node.js (Express or Fastify) | Thin — save/merge endpoint, push trigger, persistence, auth |
| Server-side persistence | PostgreSQL (doc metadata, snapshots, collaborator roles) | Yjs doc snapshots stored as binary blobs; metadata (title, collaborators, roles, timestamps) relational |
| Auth | Google OAuth 2.0 → own session | **Implemented.** Google is the only provider. Session is an httpOnly access-token cookie (15 min JWT) plus an httpOnly refresh cookie (30 days, rotated, hashed at rest) and a readable CSRF token. Supersedes the "JWT bearer" design — see Section 10 |
| Client state | TanStack Query (server state) | Session, doc list and presence are server state. Document content is owned by Yjs, not a store; UI state stays component-local |
| Design system | Tailwind 4 + shadcn/ui | Semantic CSS tokens with a `.dark` override, `next-themes` for the switch. Contract in `DESIGN_SYSTEM.md` |
| Icons | `lucide-react` | Conflicts with PRD §11 ("no external icon packs") — see Section 16 |

### 2.1 High-level data flow

1. Client edits produce Yjs updates (binary deltas), applied to the local doc immediately (optimistic) and marked as **unsaved / draft** — nothing is sent to the server yet
2. Draft state persisted continuously to IndexedDB, so an interrupted session doesn't lose unsaved edits
3. Editor clicks **Save**:
   - If online: the client's Yjs update is POSTed to the backend, which merges it into the canonical doc via CRDT, persists a full snapshot to Postgres (see note below), and the doc transitions to **saved**
   - If offline: the save request is queued; Background Sync API sends it on reconnect, and the doc shows a **pending save** state until the backend confirms the merge
4. On a successful save merge, the backend triggers Web Push to the doc's other collaborators (see Section 6 for how "should this surface as an OS notification" is decided)

**Snapshot frequency:** persist a full snapshot on every Save, not on a separate time/count-based schedule. Under the old streamed-WebSocket design, "every update" would have meant every keystroke (too fine-grained to snapshot on). Now that a Yjs update only reaches the server when a user explicitly clicks Save, Saves are already a coarse, user-paced checkpoint — so snapshotting each one is both correct and cheap. If the raw update log is also kept (e.g. for future audit/history), compact it into a fresh snapshot periodically (say, every 50 saves) purely to bound storage/read time — that's a storage-hygiene concern, not a correctness one.

### 2.2 Repository structure

Monorepo (pnpm workspaces). **This reflects the tree as built** — it has drifted from the
original sketch: the server gained `controllers/` and `validators/` layers, and the web app
uses route groups for auth boundaries.

```
OfflineDocs/
├── docs/                            techspec, PRD, DESIGN_SYSTEM, auth-code-walkthrough
├── pnpm-workspace.yaml
│
├── apps/
│   ├── web/                         Next.js 16 (App Router) PWA
│   │   ├── app/
│   │   │   ├── (public)/            RedirectIfAuthenticated → login
│   │   │   ├── (protected)/         RequireSession → dashboard, editor
│   │   │   ├── auth/callback/       OAuth landing; deliberately in neither group
│   │   │   ├── providers.tsx        QueryClientProvider + ThemeProvider
│   │   │   └── globals.css          the design system's three token layers
│   │   ├── components/
│   │   │   ├── ui/                  shadcn primitives (button, card, badge, alert, spinner)
│   │   │   ├── auth/                guards, session-pending, google icon
│   │   │   └── layout/
│   │   ├── constants/               routes, labels, errors — no inline copy in components
│   │   └── lib/
│   │       ├── api/                 client (CSRF + single-flight refresh), auth
│   │       └── auth/                useSession, path helpers
│   │
│   └── server/                      Node.js + Express 5
│       ├── prisma/schema.prisma     User, RefreshToken, Doc, DocCollaborator, PushSubscription
│       └── src/
│           ├── routes/              route tables only
│           ├── controllers/         req/res handling only
│           ├── services/            all business logic (incl. oauth/)
│           ├── middleware/          requireAuth, requireCsrfToken, validate, error-handler
│           ├── validators/          zod schemas
│           ├── lib/                 jwt, cookies, crypto, http-error
│           └── config/env.ts        fail-fast env parsing
│
└── packages/shared/                 types shared by web + server (type-only imports)
```

**Ports are swapped from the conventional arrangement:** the **API runs on 3000** and the
**web app on 4000**. `apps/web/package.json` passes `-p 4000` explicitly because `next dev`
would otherwise take 3000 from the API.

**`User` has no `Account` table.** Google is the only provider, so the identity is a
`googleId` column with a unique index. Re-adding a second provider means reintroducing that
table and backfilling — a deliberate trade, recorded in `DESIGN_SYSTEM.md`'s sibling doc.

---

## 3. PWA implementation details

### 3.1 Manifest
Standard `manifest.json` — name, icons (192/512), `display: standalone`, `start_url`, theme/background color. Nothing unusual here; the interesting work is in the service worker.

### 3.2 Service worker responsibilities
- **Install/activate**: precache app shell (JS/CSS bundles, fonts, offline fallback page)
- **Fetch handling** (per resource type):
  - App shell / static assets → **Cache First**
  - Document content API calls → **Stale-While-Revalidate** (serve cached doc instantly, refresh in background)
  - Auth/login endpoint → **Network Only** (never serve stale auth state)
- **Background Sync**: registers a sync event for two kinds of queued work — (1) a Save request made while offline, and (2) raw audio recorded while offline in the STT panel; on `sync`, flush queued Saves to the save endpoint and queued audio to `POST /docs/:id/transcribe` for transcription (audio queue: Phase 4.2, not built)
- **Push**: handle `push` event → parse payload → `showNotification()` with doc title, editor name, change summary
- **Notification click**: `notificationclick` → `clients.openWindow()` or focus existing client → deep link to `/doc/:id`
- **Update handling**: new SW installs alongside old one; do **not** call `skipWaiting()` automatically — show an in-app "update available, refresh" banner instead, to avoid yanking the doc state out from under a mid-edit user

### 3.3 Caching strategy summary

| Resource | Strategy | Rationale |
|---|---|---|
| App shell (JS/CSS/fonts) | Cache First | Rarely changes between deploys; instant load |
| Document content | Stale-While-Revalidate | Instant offline access, background freshness |
| Doc list | Network First, fallback to cache | Prefer fresh list when online, degrade gracefully |
| Auth endpoints | Network Only | Security-sensitive, must not serve stale |
| Transcription (`POST /docs/:id/transcribe`) | Network Only; the audio is queued instead (Phase 4.2) | Transcription itself needs network, but the raw audio is cached in IndexedDB and queued via Background Sync so it auto-transcribes on reconnect instead of being lost |

---

## 4. Draft & save model

- Each document is a `Y.Doc` with a `Y.Text` (or `Y.XmlFragment` if rich formatting is added later) as the shared type, held locally on each client
- The editor UI shows a **Save button** and a doc status indicator. The PRD (§6.3) specifies
  **five** states, replacing the three this spec originally listed:

  | State | Behaviour |
  |---|---|
  | Unsaved changes | Save enabled; document marked dirty |
  | Saving | Spinner, Save disabled |
  | Saved / Synced | Success badge, Save disabled |
  | Offline | Warning badge; **editing stays fully enabled**; changes queue locally |
  | Reconnecting | Queued changes flush, badge returns to Synced |

  Two consequences for the data model: a document carries a `pendingChangeCount` (surfaced on
  both the dashboard row and the editor top bar), and `connectivity` is app-level state that
  drives every badge — not something each component derives for itself.
- Status must be conveyed by **label and icon, not colour alone** (PRD §10)
- No live cursors or presence — there is no persistent connection to broadcast Yjs awareness over, so collaborators don't see each other typing in real time. A collaborator only sees another's edits after that editor Saves and they reload/re-sync the doc
- Change attribution for push copy (e.g. "Priya added 3 lines") is the **difference in line count** across the merge (`describeChange`), **not** the client-id embedded in the Yjs update. This reverses what this section originally specified; decided 15 Sep 2026 in favour of what is built, because the line delta needs no awareness state. Known weakness: an edit that leaves the line count unchanged reads "edited this document". Master spec §Phase 3 Part 2
- **Why CRDT over OT**: the offline-editing requirement rules out naive last-write-wins or operational transform (which typically assumes a central sequencing authority). Yjs merges concurrent edits deterministically without a server round-trip — here it merges each incoming Save against the canonical doc, rather than merging a continuous stream of keystrokes
- If two collaborators both Save divergent offline edits, CRDT merge still applies automatically on the backend — no manual conflict UI, same as the always-online case

### 4.1 Draft autosave (server-side backup)

Local IndexedDB persistence (above) already survives a reload on the *same* device, but doesn't help if storage is cleared or the user never comes back on that device. To cover that without reintroducing a persistent connection or a real "auto-save" (which would defeat the point of an explicit, reviewable Save):

- While a doc is open, the client periodically (every ~20–30s) POSTs its current Draft to a separate `draft` endpoint — **not** the Save endpoint
- This is a private backup keyed to `(docId, userId)`: it does **not** merge into the canonical doc, does **not** trigger a push notification, and is only ever readable by that same user to resume their own draft
- This heartbeat call doubles as the presence signal in Section 7 — same request, two purposes, so it doesn't add extra chattiness
- Given the periodic backup, a blocking `beforeunload` confirmation is unnecessary in the common case; keep a lightweight one only as a fallback for the narrow window before the *first* backup tick has fired (e.g. user types then immediately closes the tab within a few seconds of opening the doc)

---

## 5. Speech-to-text flow

- STT is **decoupled from the shared document** — audio is captured and transcribed into a **local, per-user sidebar panel**, not inserted directly into the Yjs doc
> Built as master spec §Phase 4 Part 1 — that section has the implemented contract. The offline
> recording bullet below is Phase 4 Part 2 and is **not built**: recording is disabled offline.

- Flow: mic click → permission check → record chunk → send to `POST /docs/:id/transcribe` (self-hosted `faster-whisper`) → transcript segment rendered in panel → user reviews/edits → user explicitly inserts (at last-known cursor position) or copies into the doc
- Rationale: avoids race conditions with concurrent editors, and gives users a correction step before imperfect transcription pollutes the shared document
- Panel state persisted to IndexedDB per-document so an interrupted dictation session isn't lost
- **Offline recording**: if offline when a chunk is recorded, the raw audio is cached in IndexedDB (not discarded) and a "queued — will transcribe when back online" placeholder is shown in the panel; the SW's Background Sync flushes queued audio to the transcribe endpoint on reconnect and the placeholder resolves into the transcript segment
- Explicitly **not** synced via Yjs — it's local scratch state until committed

---

## 6. Push notifications

- Subscription: on first login (or explicit opt-in), client calls `pushManager.subscribe()` with VAPID public key, sends subscription object to backend, stored per-user
- Trigger: no debounce window is needed for keystroke spam, since edits aren't sent to the server until Save — the backend sends Web Push to a document's other subscribed collaborators as soon as a Save request is merged. A short **5-second** debounce is still applied per-document (restart the timer on each new Save, then fire once it goes quiet) to collapse rapid, repeated Saves by the same editor — e.g. fixing a typo right after saving — into a single notification. Long enough to catch a quick follow-up correction, short enough that the notification still feels immediate
- Recipient targeting: push is sent to every subscribed collaborator except the saving editor. There's no server-side "active connection" concept to filter on (no persistent connection exists); instead the receiving client's service worker checks `clients.matchAll()` in its `push` handler and suppresses the OS notification (showing an in-app toast/badge update instead) if that document is already open and focused in one of its own tabs
- Payload: `{ docId, docTitle, editorName, changeSummary }` — kept small (push payloads are size-limited)
- Notification actions: primary tap deep-links to the document; consider a "Mark as read" action button in a later iteration

---

## 7. Presence indicator

A lightweight "who else has this doc open" signal, without reintroducing a persistent connection:

- Reuses the draft-autosave heartbeat from Section 4.1 — the same periodic POST while a doc is open also marks that user as present on that doc; no separate connection or extra request type needed
- Backend keeps a short-TTL record per `(docId, userId)` (in-memory map or a Postgres table with a `last_seen` column is fine at MVP scale — no Redis needed) and treats a user as "present" only while heartbeats keep landing
- TTL of roughly 60s (~2x the heartbeat interval): if heartbeats stop — tab closed, browser crashed, network dropped — the entry expires on its own. No explicit "leaving" signal is needed, which keeps this robust in an offline-first app where a clean disconnect can't be guaranteed
- Client polls a cheap "who's here" endpoint every ~15–20s while a doc is open, and renders small presence chips (e.g. avatar/initials) in the editor header — "Priya has this doc open"
- Scope is intentionally limited to open/not-open. No cursor position, no typing indicator, no live text — that would require the persistent connection this design specifically removes

---

## 8. Collaborator permissions & roles

- Roles: **Owner** (created the doc; can invite/remove collaborators and change roles), **Editor** (can edit and Save), **Viewer** (read-only)
- Stored as a doc-level ACL in Postgres — a `doc_collaborators` table of `(doc_id, user_id, role)` — rather than a single flat "all collaborators can edit" list
- Enforcement points:
  - The Save endpoint (Section 4) rejects the merge if the requesting user's role is `viewer`
  - The doc-fetch endpoint returns the caller's role alongside the doc, so the frontend can fully hide/disable the Save button and editing surface for Viewers rather than letting them type into a doc they can never persist
  - The collaborator-list endpoint is **editor+**: a Viewer cannot see who else is on a document, and only an Owner receives anyone's email address. Master spec §2
  - Push notifications (Section 6) and presence (Section 7) are only sent to/shown for users who currently have at least Viewer access
- Doc list / dashboard filters to docs the user has any role on
- Kept out of Phase 1 as a full UI (invite flow, role management screen), but the ACL table and role checks on Save/fetch should exist from Phase 1 since retrofitting access control after the fact is riskier than building it in from the start

---

## 9. Offline & conflict handling — edge cases

| Scenario | Handling |
|---|---|
| Two users Save divergent offline edits to the same doc | Yjs CRDT merges automatically on the backend when each Save lands; no manual conflict UI needed |
| User closes app with unsaved edits (browser killed) | Draft Yjs state + IndexedDB persist; restored on relaunch, Save button still shows unsaved/Draft |
| Network drops after Save is clicked | Background Sync API retries; doc shows "Saving..." → "Saved" indicator once the backend confirms the merge |
| New app version deployed while user has doc open | SW installs new version in background; banner prompts refresh rather than forcing reload |
| Mic permission denied | STT panel shows inline error; typing remains available |
| Transcription unreachable (offline or outage) | Offline, the recording is queued in IndexedDB and the panel shows a "queued" placeholder until the app is next open with a network. During an outage (`503 stt_unavailable`) the recording is kept in memory with Retry / Discard, and `stt_busy` is retried automatically |
| Push permission denied | In-app toasts/badges still work when app is open; no OS-level notification |
| Collaborator's Save is pushed while I still have unsaved local edits open | My draft isn't overwritten; I keep editing locally and the incoming change merges into my doc the next time I Save or reload |
| Viewer attempts to edit | Editing surface is disabled client-side (Section 8); Save endpoint also rejects it server-side as defense in depth |
| Draft-backup heartbeat lands but the doc was deleted/access revoked in the meantime | Backend returns 403/404; client surfaces a "you no longer have access" state instead of silently failing |

---

## 10. Security & auth notes

**Implemented.** This section describes what the code does; it replaces the earlier
"JWT bearer token" design, which was never built. Full walkthrough in
[`auth-code-walkthrough.md`](./auth-code-walkthrough.md).

- **Google OAuth only.** `GET /auth/google` → consent → `GET /auth/google/callback`. The
  authorization code is redeemed server-to-server with the client secret, so a stolen code is
  useless to a browser.
- **Login CSRF** is blocked by a signed `state` that travels twice — as a query parameter
  through Google and as an httpOnly cookie. The callback proceeds only when the two match
  byte-for-byte.
- **Both tokens are httpOnly cookies**, not bearer headers. Page JavaScript can read neither,
  so an XSS bug cannot exfiltrate a credential. The access token is a 15-minute JWT carrying
  identity only — no roles, so a revoked role takes effect immediately rather than at token
  expiry. The refresh token is a 30-day random value, stored only as a SHA-256 hash.
- **Cookie transport reintroduces CSRF**, so it is paid for explicitly: a readable
  `docsync_csrf` cookie must be echoed in an `X-CSRF-Token` header on every state-changing
  method. The guard is mounted globally, before the routes, so a new endpoint cannot ship
  without it.
- **Refresh rotation with reuse detection.** Each refresh token is single-use; presenting a
  spent one revokes every session for that user. Known limitation: the read and the
  revoke-and-replace are separate steps, so a precise race can bypass detection — and the
  obvious compare-and-swap fix would log real users out on concurrent refreshes. Needs a grace
  window before it is worth changing. See the walkthrough's Known-limitation note.
- **Account matching is on Google's `sub` alone**, never email. An unrecognised `sub`
  presenting a known email is refused (`409`), because that can only mean a recycled address —
  and guessing wrong hands over every document shared with the original user.
- Offline editing of an already-loaded document needs no live token check; the token is
  re-validated when the queued Save finally sends.
- Role checks (Section 8) run server-side on every Save / fetch / collaborator call, never only
  in the frontend.
- Dictation audio goes only to our own API and the internal, self-hosted STT service, and is
  never persisted: memory on the Node side, a tempfile deleted at the end of the request on the
  STT side (decided — master spec §16.1).
- Frontend contract: `credentials: "include"` on every call; echo the CSRF header on mutations;
  on a `401 token_expired`, refresh **once** and retry. Concurrent refreshes must be
  single-flighted or they trip the reuse alarm and log the user out.

---

## 11. Build phases

Phase numbering follows `task-distribution.md` rounds. ✅ = built and verified, 🚧 = partial.

0. ✅ **Auth (backend)** — Google OAuth, httpOnly cookie session, CSRF guard, refresh
   rotation with reuse detection, `requireAuth`. Section 10.
0. ✅ **Design system** — token layers in `globals.css`, `next-themes` switch, shadcn
   primitives. Contract in `DESIGN_SYSTEM.md`.
0. ✅ **Auth (frontend)** — login screen (desktop + mobile per design), protected route
   groups, session query, single-flight refresh, sign-out.
1. ✅ **Core editor + draft/save model** — local Yjs doc with IndexedDB persistence, Save
   with the five states from Section 4, the save-and-merge endpoint (now under a row lock —
   master spec §Phase 1 Part 2), doc CRUD, and role checks on save/fetch. 🚧 **Sharing**:
   invite, roles, remove and leave are built; pending invites, the invite endpoints and owner
   invites are **not** — master spec §18.2.
2. ✅ **PWA offline layer** — manifest, service worker, caching strategies, IndexedDB draft
   persistence, Background Sync for queued Saves, queue limits and the update banner. The worker
   now owns caching and sync and pulls in `sw-push.js` for Phase 3's push handlers — one worker
   per scope, so the two must share that file. Master spec §Phase 2.
3. ✅ **Push notifications & presence** — VAPID, subscription flow, save-triggered push with a
   5s debounce, SW suppression for an already-focused doc, presence heartbeat + chips.
   Push was absent from the PRD and was **built on an explicit decision** (Section 16 row 1).
   🚧 The draft-backup restore path is unbuilt — master spec §18.2.
4. ✅ **STT integration** — 420px dictation panel (the shared panel shell), self-hosted
   `faster-whisper` behind `POST /docs/:id/transcribe`, live level meter, insert at cursor, and
   offline recordings queued alongside queued saves. Master spec §Phase 4.
5. **Polish** — collaborator invite/role UI, link access, multi-window demo, SW update
   banner, Section 9 edge cases.

---

## 12. Open questions

> **All eight are answered.** See `docsync-master-spec.md` §17 for the decisions and §16 for the
> reasoning behind each. Kept here because the questions record what was uncertain at the time.

Carried from this spec:

1. Should Viewers still be able to use the STT panel for personal scratch notes, even though
   they cannot Save or insert into the shared doc?
2. Is Whisper audio cached server-side at all, or discarded after the transcription request?

Carried from the PRD (§13), each with the technical decision it forces:

3. **Autosave cadence vs explicit Save — which is authoritative?** This spec is built around
   an explicit, reviewable Save (Section 4), with the periodic draft POST deliberately *not*
   an autosave (Section 4.1). If autosave wins, Section 4.1 collapses into the Save endpoint
   and the "Unsaved changes" state largely disappears. **Blocks Phase 1** — it decides the
   editor's core interaction.
4. **Retention limit for queued offline changes** (time or size cap) before the user is
   warned. Needs a number to implement the warning in Phase 2.
5. **Version history depth, and whether restore ships.** See the contested non-goal in §1.2.
   Decides whether the raw Yjs update log is retained or compacted away (Section 2.1).
6. **A queued change targets a doc the user has since lost access to.** Section 9 covers the
   heartbeat case (403/404 → "you no longer have access"); the *queued Save* case needs the
   same treatment — reject and surface, or discard silently?
7. **What "Need help?" on the sign-in screen opens** — docs, contact form, or support chat.
   Currently rendered as inert text.
8. **Local storage quota handling** when the IndexedDB cache fills. Interacts with (4).

---

## 13. Design system

The visual contract lives in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) and is implemented in
`apps/web/app/globals.css`. Summary of what binds:

- **Three token layers** — palette (every hex, once) → semantic roles per theme → Tailwind
  bridge via `@theme inline`. Components reference semantic tokens only.
- **Theming** is a `.dark` class driven by `next-themes`, never duplicated components.
- **Type** — Plus Jakarta Sans (UI), JetBrains Mono (numeric/token accents). A bundled scale
  (`text-doc-title` … `text-label`) pairs each size with its line-height, weight and tracking
  so they cannot be mismatched.
- **Status colours are reserved for document state.** Not general accents.
- **Focus** — one global `:focus-visible` treatment; components do not hand-roll it.

Three points where the PRD's design section and the implementation differ — see Section 16
for the decisions needed: the radius scale, the icon library, and the missing `*-border`
tokens the badge outlines need.

---

## 14. Responsive & accessibility requirements

From PRD §6.7 and §10. These are acceptance criteria, not suggestions.

| Breakpoint | Navigation | Panels |
|---|---|---|
| 1440 desktop | Full left nav | Right-hand utility column; 420px details drawer, share panel and dictation panel |
| 768 tablet | Collapses to an icon rail | Panels retained |
| 390 mobile | Drawer nav | Bottom action bar; sheets instead of panels |

- Controls are **46–50px tall** on mobile, above the 44px touch-target floor.
- Layout adapts; **features are never removed** at smaller sizes.
- Text contrast ≥ 4.5:1 (3:1 permitted at headline scale). Measured deviations are tracked in
  `DESIGN_SYSTEM.md`, not waved through.
- Visible focus ring on every interactive element.
- `prefers-reduced-motion` disables the typewriter and caret animations. Already honoured by
  the login screen's typewriter, which renders its first word statically.
- Sync state communicated by **label and icon, not colour alone**.

---

## 15. Screen inventory

The PRD indexes designs by id; useful when a task says "build 2c". Recorded here so the
mapping survives independently of the `.dc.html` files.

| Ids | Area | Spec section |
|---|---|---|
| `1a`–`1d`, `6c`–`6d` | Dashboard, details drawer, empty state | PRD §6.2 |
| `2a`–`2g`, `6b`, `6e` | Editor and its sync states | §4, PRD §6.3 |
| `3a`–`3b`, `5b`, `6f` | Sharing, roles, link access | §8, PRD §6.4 |
| `4a`–`4e`, `6g` | Dictation | §5, PRD §6.5 |
| `5a`–`5b`, `6h` | Viewer mode, View-only badge | §8, PRD §6.6 |
| `6a`–`6h` | Responsive variants | §14 |
| `7a`, `7b`, `8e` | Sign-in (desktop / mobile / dark) | §10 — **built** |
| `8a`–`8e` | Theming | §13 |

`support.js` is runtime for the design files only and **must not be ported** (PRD §12).

---

## 16. Reconciliation with the PRD — decisions needed

> **Superseded as a live list.** `docsync-master-spec.md` §18 carries the current state of every
> conflict below, §18.1 lists the PRD statements the product has moved past, and §18.2 lists what
> is specified but unbuilt. Rows 1, 2, 3, 4 and 8 here are **closed** — push and the draft endpoint
> were built by decision, version history and autosave were answered in §16, and "live" presence is
> read as "current". Rows 5, 6 and 7 (icons, radius, badge borders) are genuinely still open and
> are design calls. This table is kept for the reasoning it records.

The PRD and this spec were written independently. Where they agree, the text above is
updated. These are the genuine conflicts; each needs a call, and none should be resolved by
whoever implements the surrounding code without asking.

| # | Conflict | This spec | The PRD | Impact |
|---|---|---|---|---|
| 1 | **Push notifications** | Whole of §6, a §1.1 goal, and Phase 3 | **Absent entirely** — not a goal, not a requirement, not even a non-goal | Largest divergence. `PushSubscription` exists in the schema and VAPID keys are in `.env.example`. Either the PRD dropped push, or it simply did not cover it. **Do not build Phase 3 until answered.** |
| 2 | **Version history** | §1.2 non-goal | Sold in the summary, the goals, and the sign-in screen's own copy | The login screen we shipped already promises "a full version history behind every save" to users. Either scope it in or change the copy. |
| 3 | **"Live" presence** | §7 is a ~20s poll; real-time is an explicit non-goal | "live presence on each document" | If "live" means streamed, it reverses this spec's central no-persistent-transport decision. Read as "current" for now. |
| 4 | **Autosave vs Save** | Explicit Save is the product's defining interaction | §13 Q1 reopens it as undecided | Blocks Phase 1. See §12 Q3. |
| 5 | **Icon library** | `lucide-react`, already used in 5 places | §11: "no external icon packs… all icons inline SVG on a 24×24 grid at `stroke-width:1.7`" | Replacing lucide means hand-authoring every icon. Cheap now, expensive after the editor lands. |
| 6 | **Radius scale** | One `--radius: 0.375rem` knob; emits 4.8 / 6 / 8.4 / 10.8px | `8px / 6px / 12px`, pills 999px | 6px matches exactly; 8px is 8.4px; **12px has no step** (nearest 10.8px). Either retune the knob or accept the drift. |
| 7 | **Badge border tokens** | Not in the palette; login badges use `border-success/25` etc. | Component spec implies bordered badges | Working, but an alpha of the accent rather than a real token. Restoring `--brand-border` (`#C6D0F6`, supplied then dropped) would settle it. |
| 8 | **Draft backup endpoint** | §4.1 — private per-user backup, doubles as the presence heartbeat | No mention | Harmless if kept, but it is unspecified product surface. |

---

## 17. State model

From PRD §8, mapped onto the chosen implementation.

| Store | Contents | Owned by |
|---|---|---|
| `session` / `currentUser` | From Google OAuth; gates all routes | TanStack Query (`useSession`) — **built** |
| `documents[]` | id, title, owner, collaborators, updatedAt, `syncState`, `pendingChangeCount` | TanStack Query |
| `activeDocument` | content, isDirty, role, presence list, cursor | **Yjs `Y.Doc`** — not a store. Only the derived flags surface to React |
| `connectivity` | online/offline; drives every sync badge | App-level (`navigator.onLine` + SW signals) |
| `dictation` | panel open, recording, audioLevel, transcript | Component-local; transcript in IndexedDB per doc. Queued audio joins it in Phase 4.2 |
| `ui` | theme, drawer/panel/sheet flags, active row menu | `next-themes` for theme; the rest component-local |

The important line: **document content is owned by Yjs, never mirrored into a state manager.**
Mirroring it would create two sources of truth for the one thing the CRDT exists to arbitrate.
