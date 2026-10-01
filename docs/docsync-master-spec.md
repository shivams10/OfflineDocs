# DocSync — Master PRD & Technical Specification

**Product:** DocSync — offline-first collaborative document workspace
**Status:** Living document — **Phases 0–4 are built** (Phase 1 Part 3 partially — §Phase 1
Part 3). Phase 5 is forward-looking
**Owner:** Shivam
**Last updated:** September 19, 2026 — Phase 2 (PWA, offline queue) merged with the Phase 3/4
line and its §16.2 limits completed; Phase 4 Part 2 (offline dictation) built. See §Phase 2 and
§Phase 4 Part 2 for what that merge required. Earlier (September 17): Phase 4 Part 1 built; §3, §5.1, §6.1, §8,
§Phase 4, §16.1 and §18.1 updated to match it. Earlier (September 15): reconciled against the
merged code: the status keys, the endpoint index, Phase 1 Part 3 and §16.7 now describe what
exists rather than what was intended.
Where the two differed, the difference is recorded in §18.1 rather than quietly dropped.

---

## 0. How to read this document

This is the single consolidated spec: every feature, organised **phase by phase**, and within
each phase **part by part**. Each part carries both halves of the story:

- **PRD** — what it does, who can do it, what the user sees, what is deliberately excluded.
- **Tech spec** — data model, endpoints, contracts, frontend modules, enforcement points.

**Sections 1–8 are cross-cutting.** They hold everything that is true regardless of phase —
architecture, data model, API conventions, roles, design system, accessibility, security. Phase
sections do not repeat them; they reference them.

### Status key

| Symbol | Meaning |
|---|---|
| ✅ | Built and verified |
| 🚧 | Partially built |
| ⬜ | Specified, not started |
| ❓ | Blocked on an open question — see §17 |

### Relationship to the existing docs

This document consolidates and supersedes as a *reading order*; the source documents remain
authoritative for their own detail and are not deleted:

| Source | What it holds that isn't duplicated here in full |
|---|---|
| `DocSync-PRD.md` | The original product brief, verbatim, including design-screen ids |
| `techspec.md` | Long-form architecture rationale, §16 PRD-reconciliation table |
| `phase1-techspec.md` | Phase 1 implementation detail and per-endpoint contracts |
| `phase1-part2-prd.md` | Editor QA script, full acceptance checklist |
| `phase1-part3-prd.md` | Sharing QA script, full acceptance checklist |
| `DESIGN_SYSTEM.md` | The implemented token contract |
| `auth-code-walkthrough.md` | Line-by-line walkthrough of the auth implementation |
| `task-distribution.md` | The two-person round schedule the phases derive from |

**Conflicts are recorded, not silently resolved** (§18). That convention is inherited from
`techspec.md` §16 and is deliberate: a conflict between the PRD and the spec is a decision
someone owns, not something the implementer picks on the way past.

---

## 1. Product overview

### 1.1 Summary

DocSync is a collaborative document workspace whose defining behaviour is **offline-first
editing**. Any document a user has opened stays fully editable without a connection, and queued
changes merge when the device reconnects. Around that core sit a document dashboard, an editor
with explicit sync states, sharing and permissions, dictation-to-text, and a read-only viewer
mode.

Collaboration is **save-and-merge, not live co-editing**. There is no persistent transport, no
live cursors, no streamed keystrokes. Edits stay local and explicitly *draft* until the editor
clicks **Save**, at which point they merge into the canonical document via CRDT and collaborators
are notified by push.

### 1.2 Problem

Existing collaborative editors treat connectivity as a precondition. When the network drops,
users either lose the ability to edit, or they edit into an ambiguous state and cannot tell
whether their work is safe. The failure is as much informational as technical: people do not
trust that unsynced work will survive.

DocSync addresses both halves — keep editing available offline, and make sync state visible at
every point where a user might worry about it (dashboard row, editor top bar, pending-change
counts).

### 1.3 Goals

- A document opened once is editable with no connection — no degraded mode, no read-only fallback.
- Sync state is always legible: synced, saving, pending, offline, reconnecting.
- Sign-in is a single action. No credential management for the user or the team.
- Conflict-free merging at save time, with no manual conflict UI.
- Per-document collaborator permissions (Owner / Editor / Viewer), enforced server-side.
- Push notifications for document updates, including when the app is fully closed.
- Speech-to-text capture, reviewed before insertion — never auto-committed.
- Parity of function across 1440 / 768 / 390, light and dark: layout adapts, features are not removed.
- Serve as a reference implementation of PWA primitives — service workers, caching strategies,
  background sync, push.

### 1.4 Non-goals

| Non-goal | Note |
|---|---|
| Real-time co-editing, live cursors, streamed keystrokes | Superseded by draft + Save. Non-realtime presence *is* in scope (Phase 3) |
| Manual conflict-resolution UI | Merge is automatic — CRDT |
| Email/password auth, non-Google SSO, account recovery | Google is the only provider |
| Rich text, images, tables, embeds | Plain text for v1 |
| Comments and suggestion mode | — |
| Folders, tags, or search beyond the document list | — |
| Public/anonymous document links | The share panel's link-access section is rendered disabled (§Phase 1 Part 3) |
| Native mobile app | PWA only, installable via browser |
| Version history / restore | Restore UI deferred past Phase 5; the underlying update log *is* retained from Phase 2 — §16.3 |

### 1.5 Users and roles

| User | Needs |
|---|---|
| **Owner** | Creates documents, controls sharing and roles, renames and deletes |
| **Editor** | Writes, dictates, saves; cannot change sharing |
| **Viewer** | Reads only; sees a *View only* badge, no Save, no dictation, no share entry point |

Assumed context: knowledge workers who move between connected and unconnected environments
(transit, flights, poor coverage), working with 1–5 collaborators per document.

### 1.6 Success measures

- Share of editing sessions that continue uninterrupted across a connectivity drop.
- Queued-change merge success rate on reconnect — target: no user-visible failures.
- Time from sign-in click to dashboard render for a returning user.
- Share of first-time users who create or open a document in the first session.
- Support contacts mentioning lost or unsynced work — target: trending to zero.

---

## 2. The role matrix (authoritative)

This is the single source for what each role can do. Every phase enforces its slice of it; no
phase invents its own rules.

| Action | Owner | Editor | Viewer |
|---|---|---|---|
| Open document, read content | ✅ | ✅ | ✅ |
| Edit title / body | ✅ | ✅ | ❌ read-only |
| Save | ✅ | ✅ | ❌ no Save control at all |
| Duplicate | ✅ | ✅ | ✅ |
| Rename from dashboard row menu | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |
| Open the share panel | ✅ | ✅ read-only | ❌ no entry point at all |
| See the member list and roles | ✅ | ✅ | ❌ |
| See collaborators' email addresses | ✅ | ❌ names only | ❌ |
| See pending invites | ✅ | ❌ | ❌ |
| Invite someone | ✅ | ❌ | ❌ |
| Change a role | ✅ | ❌ | ❌ |
| Remove someone else | ✅ | ❌ | ❌ |
| Leave the document | ❌ owner can't leave (§2.1) | ✅ | ✅ |
| Use dictation (Phase 4) | ✅ | ✅ | ❌ no entry point at all |
| Receive push for a doc (Phase 3) | ✅ | ✅ | ✅ |
| Appear in presence (Phase 3) | ✅ | ✅ | ✅ |

**Where the member list is enforced.** "See the member list and roles" is a server rule, not a
hidden button: `GET /docs/:id/collaborators` is **editor+**, so a viewer asking for it directly gets
`403`. Emails are then narrowed a second time inside the response — owners only (§Phase 1 Part 3).
Role decides whether you see the list at all, and then how much of each row.

Two rules the matrix depends on:

### 2.1 The last-owner rule

**A document can never end up with zero owners.** Every path that would cause that is rejected
at the service layer — not merely hidden in the UI:

- Demoting the only owner → `400 last_owner`.
- The only owner leaving or being removed → `400 last_owner`.

There is **no ownership transfer action**. Handing a document over means inviting the other
person as an Owner, then demoting or removing yourself. A sole owner who wants out has no route —
a known dead end, recorded rather than worked around.

### 2.2 Not-a-collaborator is a 404, never a 403

A caller with no `DocCollaborator` row on a document gets `404 not_found` whether the document
exists or not. A `403 forbidden` means only *"you are a collaborator, but your role is too low"*.
Splitting it any other way lets a non-collaborator probe for the existence of documents they
cannot see.

---

## 3. Architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16 (App Router) | PWA via a hand-written service worker, not `next-pwa` — full control over caching/push |
| Merge model | Yjs (CRDT) | Applied at Save time, not streamed |
| Local persistence | IndexedDB via `y-indexeddb` | Local draft state and offline source of truth |
| Speech-to-text | **Self-hosted `faster-whisper`** (Python + FastAPI), proxied by the Node API | Replaces the cloud Whisper API. Audio never leaves our own infrastructure — §Phase 4.1 |
| Save transport | HTTP REST | Client POSTs a base64 Yjs update; no persistent connection |
| Push | Web Push API (VAPID) | Triggered server-side after a Save is persisted |
| Backend | Node.js + Express 5 | Thin: save/merge, push trigger, persistence, auth |
| Server persistence | PostgreSQL via Prisma | Yjs snapshots as `Bytes`; metadata relational |
| Auth | Google OAuth 2.0 → own cookie session | §7 |
| Client state | TanStack Query | Session, doc list, collaborators, presence are server state |
| Design system | Tailwind 4 + shadcn/ui | Semantic tokens with a `.dark` override, `next-themes` |
| Icons | `lucide-react` | Conflicts with the PRD — §18 conflict 5 |

### 3.1 Data flow

1. Client edits produce Yjs updates, applied locally and marked **draft** — nothing is sent yet.
2. Draft state persists continuously to IndexedDB, so an interrupted session loses nothing.
3. Editor clicks **Save**:
   - **Online** — the Yjs update is POSTed, merged into the canonical doc, a full snapshot is
     written, and the doc transitions to **saved**.
   - **Offline** — the save is queued; Background Sync sends it on reconnect (Phase 2) and the doc
     shows **pending** until the backend confirms.
4. On a successful merge, the backend triggers Web Push to the doc's other collaborators (Phase 3).

**Snapshot frequency: a full snapshot on every Save.** Because an update only reaches the server
when a user explicitly clicks Save, Saves are already a coarse, user-paced checkpoint —
snapshotting each one is both correct and cheap. If the raw update log is retained for history,
compact it periodically (~every 50 saves) purely to bound storage.

### 3.2 Repository structure

```
OfflineDocs/
├── docs/                            this doc, PRD, techspec, DESIGN_SYSTEM, walkthrough
├── e2e/                             Playwright specs + per-role storage states
├── .qa/                             qa-kit basis, plans, findings, runs
│
├── apps/
│   ├── web/                         Next.js 16 (App Router) PWA — port 4000
│   │   ├── app/
│   │   │   ├── (public)/            RedirectIfAuthenticated → login
│   │   │   ├── (protected)/         RequireSession → dashboard, doc/[id]
│   │   │   ├── auth/callback/       OAuth landing; deliberately in neither group
│   │   │   ├── providers.tsx        QueryClientProvider + ThemeProvider
│   │   │   └── globals.css          the design system's three token layers
│   │   ├── components/{ui,auth,layout,documents}/
│   │   ├── constants/               routes, labels, errors — no inline copy in components
│   │   └── lib/{api,auth,documents}/
│   │
│   ├── server/                      Node + Express 5 — port 3000
│   │   ├── prisma/schema.prisma
│   │   └── src/{routes,controllers,services,middleware,validators,lib,config}/
│   │
│   └── stt/                         Python + FastAPI + faster-whisper — port 8000 (Phase 4)
│                                    one main.py, run from a local venv
│                                    internal only; never exposed publicly
│
└── packages/shared/                 types shared by web + server (type-only imports)
```

**Ports are swapped from the conventional arrangement:** the API is on **3000**, the web app on
**4000** (`next dev -p 4000`), because `next dev` would otherwise take 3000 from the API.

**Layering is strict on the server:** `routes` (route tables only) → `controllers` (req/res only)
→ `services` (all business logic), with `validators` holding zod schemas. No phase introduces a
fourth pattern.

---

## 4. Data model

```prisma
enum CollaboratorRole { owner editor viewer }

model User            { id, googleId @unique, email @unique, name?, avatarUrl?, createdAt }
model RefreshToken    { id, userId, tokenHash @unique, expiresAt, revokedAt?, createdAt }
model Doc             { id, title, snapshot Bytes?, ownerId, createdAt, updatedAt }
model DocCollaborator { docId, userId, role      @@id([docId, userId]) }
model DocInvite       { id, docId, email, role, invitedById, createdAt  @@unique([docId, email]) }
model PushSubscription{ id, userId, endpoint @unique, p256dh, auth, createdAt }
```

Three modelling decisions carry weight across phases:

1. **The owner gets a `DocCollaborator` row** (`role: owner`) at creation time, in the same
   transaction as the `Doc`. "Every doc I can access" is then one query against
   `DocCollaborator`, not a union of owned and shared. `Doc.ownerId` remains, but access is read
   from the collaborator table.
2. **`DocInvite` is a separate table from `DocCollaborator`**, not a nullable-user collaborator
   row. An invite and a real membership never coexist for the same person: claiming deletes the
   invite and inserts the collaborator row. Emails are stored lowercased and trimmed so the
   claim lookup at sign-in is an exact match.
3. **Snapshots are `Bytes` at rest and base64 on the wire.** Nothing binary crosses the wire as
   anything but a base64 string — `Uint8Array` does not survive `JSON.stringify`.

### 4.1 Shared types (`packages/shared/src/types.ts`)

| Type | Shape | Used by |
|---|---|---|
| `Doc` | id, title, ownerId, createdAt, updatedAt | — |
| `DocSummary` | id, title, role, collaborators[], updatedAt, syncState, pendingChangeCount | Dashboard row |
| `DocDetail` | `Doc` + `snapshot: string` (base64) + `role` | Editor fetch |
| `DocCollaboratorDto` | userId, name, email \| null, avatarUrl, role | Share panel, details drawer |
| `DocInviteDto` | id, email, role, createdAt | Share panel (owner only) |
| `CreateDocRequest` | `title?` | |
| `RenameDocRequest` | `title` | |
| `SaveRequest` | `{ update: string }` — base64 Yjs update | |
| `InviteCollaboratorRequest` | `{ email, role }` | |
| `ChangeRoleRequest` | `{ role }` | |

`syncState` uses one vocabulary everywhere: `unsaved` / `saving` / `saved` / `offline` /
`reconnecting`. The badge built in Phase 1 needs no rework when Phase 2 wires the real queue.

**Every response wraps its payload under a named key** — `{ user }`, `{ docs }`, `{ doc }`,
`{ collaborators }` — never a bare array. One convention, matching `MeResponse`. (An `invites` key
joins that response only when pending invites are built — §18.2.)

---

## 5. API conventions

- Every error is `{ error: { code, message, details? } }`, built via `AppError`. Factories take
  an optional `code` override so a specific code (`last_owner`, `already_collaborator`) can share
  a status with a generic one.
- `requireAuth` gates everything. `requireCsrfToken` is mounted **globally, before the routes**,
  so a new mutating endpoint cannot ship without CSRF protection.
- `requireRole(minimum)` loads the caller's `DocCollaborator` row for `req.params.id` and
  attaches it to the request. Missing row → `404`; row present but role too low → `403` (§2.2).
- Implicit on every doc-scoped route, not repeated per endpoint: `401` without a session,
  `404` if not a collaborator, `403` if below the required role.

### 5.1 Endpoint index (all phases)

| Method | Path | Min. role | Phase |
|---|---|---|---|
| GET | `/auth/google`, `/auth/google/callback` | — | 0 ✅ |
| POST | `/auth/refresh`, `/auth/logout` | authed | 0 ✅ |
| GET | `/auth/me` | authed | 0 ✅ |
| GET | `/docs` | authed | 1.1 ✅ |
| POST | `/docs` | authed | 1.1 ✅ |
| GET | `/docs/:id` | viewer | 1.1 ✅ |
| PATCH | `/docs/:id` | owner | 1.1 ✅ |
| DELETE | `/docs/:id` | owner | 1.1 ✅ |
| POST | `/docs/:id/duplicate` | viewer | 1.1 ✅ |
| POST | `/docs/:id/save` | editor | 1.2 ✅ |
| GET | `/docs/:id/collaborators` | **editor** (§2) | 1.3 ✅ |
| POST | `/docs/:id/collaborators` | owner | 1.3 ✅ |
| PATCH | `/docs/:id/collaborators/:userId` | owner | 1.3 ✅ |
| DELETE | `/docs/:id/collaborators/:userId` | owner, or self ("leave") | 1.3 ✅ |
| PATCH | `/docs/:id/invites/:inviteId` | owner | 1.3 ⬜ **not built** |
| DELETE | `/docs/:id/invites/:inviteId` | owner | 1.3 ⬜ **not built** |
| POST | `/docs/:id/draft` | **viewer** (§16.6) | 3.1 ✅ |
| GET | `/docs/:id/draft` | viewer, own only | 3.1 ✅ |
| GET | `/docs/:id/presence` | viewer | 3.1 ✅ |
| GET | `/push/vapid-public-key` | authed | 3.2 ✅ |
| POST | `/push/subscribe` | authed | 3.2 ✅ |
| DELETE | `/push/subscribe` | authed | 3.2 ✅ |
| POST | `/docs/:id/transcribe` | editor | 4.1 ✅ |

One internal service sits behind this table and is **not** part of the public API: the Python
`faster-whisper` service on `:8000`, bound to `127.0.0.1` and called only by the Node API
(`STT_URL`) — Phase 4.1.

---

## 6. Design system, responsive & accessibility

The visual contract lives in `DESIGN_SYSTEM.md` and is implemented in `apps/web/app/globals.css`.
What binds across every phase:

- **Three token layers** — palette (every hex, once) → semantic roles per theme → Tailwind bridge
  via `@theme inline`. Components reference semantic tokens only.
- **Theming** is a `.dark` class driven by `next-themes` — never duplicated components.
- **Type** — Plus Jakarta Sans (UI), JetBrains Mono (numeric/token accents). A bundled scale
  (`text-doc-title` … `text-label`) pairs each size with its line-height, weight and tracking so
  they cannot be mismatched.
- **Status colours are reserved for document state.** Not general accents.
- **Focus** — one global `:focus-visible` treatment; components do not hand-roll it.
- **Copy lives in `constants/labels.ts` and `constants/errors.ts`**, never inline in a component.

### 6.1 Responsive contract

| Breakpoint | Navigation | Panels |
|---|---|---|
| 1440 desktop | Full left nav | Right-hand utility column; 420px details drawer, share panel and dictation panel |
| 768 tablet | Icon rail | Panels retained |
| 390 mobile | Drawer nav | Bottom action bar; sheets instead of panels |

Every overlay — details drawer, share panel, dictation panel, nav drawer — reuses **one**
scrim + slide-in mechanism. Escape, the close control and a scrim click all dismiss.

### 6.2 Accessibility (acceptance criteria, not suggestions)

- Text contrast ≥ 4.5:1 (3:1 permitted at headline scale). Measured deviations are tracked in
  `DESIGN_SYSTEM.md`, not waved through.
- Visible focus ring on every interactive element.
- Mobile controls 46–50px tall, above the 44px touch-target floor.
- `prefers-reduced-motion` disables the typewriter and caret animations.
- **Sync state is communicated by label and icon, not colour alone.**
- Layout adapts at smaller sizes; features are never removed.

---

## 7. Security & auth (cross-cutting)

Full walkthrough in `auth-code-walkthrough.md`. What every phase must respect:

- **Google OAuth only.** The authorization code is redeemed server-to-server with the client
  secret, so a stolen code is useless to a browser.
- **Login CSRF** is blocked by a signed `state` travelling twice — as a query parameter through
  Google and as an httpOnly cookie. The callback proceeds only on a byte-for-byte match.
- **Both tokens are httpOnly cookies**, not bearer headers — an XSS bug cannot exfiltrate a
  credential. The access token is a 15-minute JWT carrying **identity only, no roles**, so a
  revoked role takes effect immediately rather than at token expiry. The refresh token is a
  30-day random value stored only as a SHA-256 hash.
- **Cookie transport reintroduces CSRF**, paid for explicitly: a readable `docsync_csrf` cookie
  echoed in an `X-CSRF-Token` header on every state-changing method.
- **Refresh rotation with reuse detection** — each refresh token is single-use; presenting a
  spent one revokes every session for that user. *Known limitation:* the read and the
  revoke-and-replace are separate steps, so a precise race can bypass detection. The obvious
  compare-and-swap fix would log real users out on concurrent refreshes; it needs a grace window
  first.
- **Account matching is on Google's `sub` alone, never email.** An unrecognised `sub` presenting
  a known email is refused (`409`) — that can only mean a recycled address, and guessing wrong
  hands over every document shared with the original user.
- **Role checks run server-side on every save / fetch / collaborator call**, never only in the
  frontend. Client-side hiding is UX, not enforcement.
- **Dictation audio never leaves our infrastructure and is never persisted** — transcription is
  self-hosted and the audio is discarded when the request ends (Phase 4.1). The Python STT service
  is internal-only and has no auth surface of its own, precisely so these rules stay implemented
  in exactly one place.
- Frontend contract: `credentials: "include"` on every call; echo the CSRF header on mutations;
  on `401 token_expired`, refresh **once** and retry — single-flighted, or concurrent refreshes
  trip the reuse alarm and log the user out.
- Offline editing of an already-loaded document needs no live token check; the token is
  re-validated when the queued Save finally sends.

---

## 8. State model

| Store | Contents | Owned by |
|---|---|---|
| `session` / `currentUser` | From Google OAuth; gates all routes | TanStack Query (`useSession`) ✅ |
| `documents[]` | id, title, role, collaborators, updatedAt, syncState, pendingChangeCount | TanStack Query ✅ |
| `activeDocument` | content, isDirty, role, presence list | **Yjs `Y.Doc`** — not a store ✅ |
| `connectivity` | online/offline; drives every sync badge | App-level (`navigator.onLine` + SW signals) |
| `dictation` | panel open, recording, audioLevel, transcript | Component-local; the transcript in IndexedDB (`docsync-dictation`), one entry per doc. Audio recorded offline sits in the save queue as an `audio` entry (§Phase 4 Part 2) |
| `ui` | theme, drawer/panel/sheet flags, active row menu | `next-themes` for theme; rest component-local |

The important line: **document content is owned by Yjs and never mirrored into a state manager.**
Mirroring it would create two sources of truth for the one thing the CRDT exists to arbitrate.

---

# Phase 0 — Foundations ✅

**Shipped.** Auth and the design system, end to end. Nothing depends on a later phase; every
later phase depends on this one.

## Phase 0 · Part 1 — Authentication (backend) ✅

### PRD

- **Continue with Google is the only authentication method.** Email, password,
  forgot-password, the or-divider and the create-account link are deliberately absent.
- A first-time sign-in **creates the user's workspace implicitly**. There is no separate sign-up
  screen and no account-recovery flow.
- On success the user lands on the documents dashboard.

### Tech spec

- `GET /auth/google` → consent → `GET /auth/google/callback`, code redeemed server-to-server.
- Session issued as an httpOnly 15-minute access JWT + a 30-day rotated, hashed refresh cookie,
  plus a readable CSRF token. Details and rationale in §7.
- `requireAuth`, `requireCsrfToken`, `validate`, `error-handler` middleware.
- `User` has **no `Account` table** — Google is the only provider, so identity is a `googleId`
  column with a unique index. Adding a second provider means reintroducing that table and
  backfilling: a deliberate trade.

## Phase 0 · Part 2 — Design system ✅

### PRD

Light and dark are the same components with a different token set. Dark is a theme switch, never
duplicated components.

### Tech spec

Three token layers in `globals.css`, `next-themes` for the switch, shadcn primitives (button,
card, badge, alert, spinner). Contract in `DESIGN_SYSTEM.md`. See §6.

## Phase 0 · Part 3 — Authentication (frontend) ✅

### PRD — sign-in screen (designs `7a` desktop, `7b` mobile, `8e` dark)

- Desktop is a **two-column split with no card frame**: a brand-soft left column carrying the
  product story (heading, description, three capability badges, decorative workspace-preview
  card) and a 640px surface-coloured right column carrying the sign-in action.
- The right column's top row shows an animated line ("Start documenting / drafting /
  collaborating") with a blinking caret, and a **Need help?** link. Under
  `prefers-reduced-motion` the first word renders statically.
- Mobile collapses to a single column with the Google button pinned to the bottom.

### Tech spec

- Route groups as the auth boundary: `(public)/login` behind `RedirectIfAuthenticated`,
  `(protected)/*` behind `RequireSession`, `auth/callback` deliberately in neither.
- `useSession` via TanStack Query; `lib/api/client.ts` carries the CSRF header and the
  single-flight refresh-and-retry.

### Known gaps — both closed, September 15 2026

- ~~**Need help?** is inert text.~~ **Removed** from the sign-in screen, per §16.4. It returns as a
  link only once a static in-app `/help` page exists.
- ~~The sign-in copy promises "a full version history behind every save".~~ **Corrected.** The
  pitch now reads "live presence on each document and roles for everyone you share it with", and
  the third capability badge is "Roles & sharing". §16.3 part 1 is done; parts 2 and 3 (retain the
  update log, defer the restore UI) still stand for Phase 2.

---

# Phase 1 — Dashboard, Editor, Sharing ✅

**Shipped.** The first genuinely usable slice: create documents, edit and save them, share them
with people. Consolidates the remaining Round 1 editor-shell work with all of Round 2, because
dashboard, editor and sharing only make sense together.

**Resolved before build (was the blocking question):** *autosave vs. explicit Save* — **explicit
Save is authoritative**, confirmed by product. There is no autosave and no `draft` endpoint in
Phase 1; the periodic draft-backup POST stays a private, non-authoritative backup and moves to
Phase 3 with presence.

**Deliberately not built in Phase 1:** service worker, offline caching, Background Sync and queue
replay (Phase 2); presence chips and push (Phase 3); dictation (Phase 4); version history,
real-time cursors, comments, folders/tags/search, working public links (non-goals). The dashboard
and editor still **degrade sensibly** offline — Save disabled with a clear reason — before the
real queue lands.

## Phase 1 · Part 1 — Dashboard (+ shared foundation) ✅

### PRD

Designs `1a`–`1d`, `6c`–`6d`.

- Document table rows show **title, collaborator avatar stack, edited time, and a sync badge**
  (Saved / Draft / Offline). Pending rows show a queued-change count.
- **Row hover reveals an overflow menu**, role-conditional: owner gets rename, share, details,
  delete; non-owner gets open, duplicate, leave.
- **First-run empty state** presents a single primary action: *New document*.
- A **420px right drawer** shows document details: title, metadata, members, activity.
- **New document** (desktop top bar, mobile bottom bar) creates an empty untitled document and
  navigates straight into the editor.
- Mobile presents the same list as stacked rows with a drawer nav.

**Draft badges are per-device.** A document with unsaved local changes shows **Draft** on its
dashboard row and in its details drawer — but only in the browser that holds the draft. A
different browser shows the same document as **Saved**; it has no way to know about a draft that
exists only on the other device. Within one browser, a dashboard tab's badge updates
automatically when an editor tab marks the document dirty — no manual refresh.

### Tech spec

**Backend**

| Endpoint | Role | Notes |
|---|---|---|
| `GET /docs` | authed | `DocSummary[]`, filtered to the caller's `DocCollaborator` rows. An empty list is not an error |
| `POST /docs` | authed | `201`. Creates `Doc` + the owner's `DocCollaborator` row in **one `$transaction`** — if the second insert fails the first rolls back. Never create-then-patch. `400` on a whitespace-only title |
| `GET /docs/:id` | viewer | `DocDetail` incl. base64 snapshot + the caller's role |
| `PATCH /docs/:id` | owner | Rename only — move/folders is a non-goal. `400` on empty title |
| `DELETE /docs/:id` | owner | Hard delete; cascades `DocCollaborator` and `DocInvite`. `204` |
| `POST /docs/:id/duplicate` | viewer | `201` with the **new** doc's id, owned by the caller; title gains a distinguishing suffix so two identical rows can't appear |

Foundation shipped here and depended on by Parts 2 and 3:

- `packages/shared`: `Doc`, `DocSummary`, `DocDetail`, `DocCollaboratorDto`, request and response
  envelope types (§4.1).
- `SaveRequest` fixed to `{ update: string }` (base64) — the stubbed `Uint8Array` does not
  round-trip through JSON, and `docId` duplicated the route param.
- `AppError`: optional `code` override on the existing factories, plus a new
  `AppError.conflict` (409).
- `middleware/require-role.ts` — the 404/403 split from §2.2.

**Frontend**

- `lib/api/client.ts` extended with `apiPost<T>(path, body?)`, `apiPatch<T>`, `apiDelete` — the
  same `apiFetch` underneath. **Do not add a second fetch wrapper.**
- `lib/api/documents.ts` + `lib/documents/use-documents.ts` — `useDocs`, `useCreateDoc`,
  `useRenameDoc`, `useDeleteDoc`, `useDuplicateDoc`, mirroring `use-session.ts` (query-key
  constant, cache invalidation on mutation success).
- `components/documents/`: `DocumentRow`, `DocumentTable`, `DocumentRowSkeleton`, `SyncBadge`,
  `RoleChip`, `EmptyState`, `DocumentDetailsDrawer` (420px desktop / sheet mobile),
  `RowOverflowMenu`, `NewDocumentButton`.
- `lib/documents/dirty-docs.ts` + `use-dirty-doc-ids.ts` — the per-device draft registry that
  drives the dashboard's Draft badge and updates across tabs.

## Phase 1 · Part 2 — Editor ✅

### PRD

Designs `2a`–`2g`, `6b`, `6e`. Reached at `/doc/<id>` — from a row's title, or Details → Open.

A single-document **plain-text** editor: a title, a body, an explicit **Save**, a visible sync
badge, offline-safe local drafts, and read-only access for viewers. **No rich text** — no bold,
italic, lists or images — by design for this phase.

**Sync states**

| State | Badge | Behaviour |
|---|---|---|
| Unsaved changes | **Draft** | Save enabled; document marked dirty |
| Saving | **Saving…** | Spinner, Save disabled |
| Saved | **Saved** | Success badge, Save disabled |
| Offline | **Offline** | Warning badge; **editing stays fully enabled**; Save disabled |
| Save failed | **Save failed** | Banner "Couldn't save. Try again." with a Retry link |

**Opening**

- A new document opens with an empty title (placeholder *Untitled document*), an empty body
  (placeholder *Start writing…*), the title field focused, and the badge **already reading
  Draft** — deliberately: it has never been through an explicit Save.
- Reopening a saved document with no further edits reads **Saved**.
- A document that doesn't exist or isn't yours shows **"Couldn't load this document"** with a
  **Retry** button — no crash, no blank screen.

**Title** — Enter, Tab, blur or navigating away all commit. **Escape reverts** to the last-saved
title and exits the field. Empty or unchanged commits nothing. Title changes go through the
**separate, immediate rename endpoint**, independent of the Save button, which covers the body
only.

**Body** — plain text, standard textarea behaviour including native undo. The moment you type,
status flips to **Draft** and Save enables.

**Saving** — the Save button or **Cmd/Ctrl+S** anywhere in the editor. Save is disabled whenever
you are a Viewer, you are offline, there is nothing unsaved, or a save is already in flight. On
success the badge flips to **Saved** and the dashboard row reflects it. On failure your typed
content is not lost — only the save attempt failed.

**Offline** — you can keep typing freely; nothing blocks input. Badge reads **Offline**, banner
reads *"You're offline — reconnect to save."*, Save is disabled in both locations.
**Coming back online does not auto-save** — you must click Save again. Automatic
queued-save-on-reconnect is Phase 2.

**Local draft persistence** — type without saving, close the tab or the browser, reopen the same
URL: the unsaved text is still there and the badge still reads **Draft**. It was never silently
saved, only recovered locally. This is per-browser (that browser's IndexedDB) — a different
browser or an incognito window will not show the draft. That is expected, not a bug.

**Viewer mode** (designs `5a`–`5b`, `6h`) — title and body visible but not editable, no Save
button anywhere, no offline or save-failed banner, and a **View only** badge beside the sync
badge at all times.

### Tech spec

**Backend** — `POST /docs/:id/save`, **editor+**

- Body `SaveRequest` = `{ update: string }`, base64 Yjs update.
- Decode with `Buffer.from(value, "base64")`, merge via CRDT against the stored snapshot, write a
  fresh snapshot, bump `updatedAt`.
- **The read, the merge and the write happen in one transaction, under `SELECT … FOR UPDATE` on
  the `Doc` row.** Two saves landing together would otherwise both merge into the same starting
  snapshot, and the second write would discard the first editor's merge — while that editor's
  client had already marked the work saved and would never resend it. CRDT merges concurrent
  *edits*; it does not protect a read-modify-write on one row. Covered by
  `services/docs.save.concurrency.test.ts`.
- `200 DocResponse` reflecting the post-merge `updatedAt`.
- `400 bad_request` / `invalid_update` — not valid base64, or bytes that don't apply as a Yjs
  update. **Reject rather than silently dropping**, and never corrupt the stored document.
- `403 forbidden` for a viewer — the sharpest role check in the phase, and the enforcement point
  §7 leans on hardest. Client-side hiding is not the control.
- `404 not_found` per §2.2.

**Frontend**

- New route `app/(protected)/doc/[id]/page.tsx`; `yjs` + `y-indexeddb` added to `apps/web`.
- `lib/documents/use-yjs-doc.ts` — local `Y.Doc` with a `Y.Text` body, persisted via
  `y-indexeddb`. This is the Round 1 "editor shell" the repo never had, built directly against
  the real Save endpoint rather than as a throwaway local-only stage.
- `lib/documents/base64.ts` — the single encode/decode boundary; nothing binary crosses the wire
  any other way.
- `SyncBadge` (shared with Part 1) shows all five states; Save enabled only in `unsaved`.
- `useSaveDoc()` invalidates the dashboard doc-list query on success, so the row's `updatedAt`
  and badge refresh without a manual refetch.
- Desktop right-hand utility column; mobile bottom action bar, reusing `app-shell.tsx`.
- **Presence avatar stack: the top-bar slot is reserved and deliberately unwired** — Phase 3.
- Viewer lock is driven by `role` on `DocDetail`.

### Notes for testers

API-level happy-path testing of `/save` is not useful — hand-crafting a valid Yjs update without
the client library isn't practical. Test the happy path through the UI; test the **negative** path
directly (`{ "update": "not-a-real-update" }` must return `400` and leave the document intact).

## Phase 1 · Part 3 — Sharing & collaborators 🚧

> **Read this first.** This section was written ahead of the merge and described pending invites,
> invite endpoints and owner invites that were never committed (§16.7). It has been **corrected to
> describe the merged behaviour**. Everything marked ⬜ below is specified, agreed, and *not built*
> — do not test it as though it were. The unbuilt items are gathered in §18.2.

### PRD

Designs `3a`–`3b`, `5b`, `6f`. Four things: **invite** someone by email as Editor or Viewer;
**see** everyone with access and at what level; **change** a role or **remove** someone; **leave**
a document you were shared into.

**Owner is not an assignable role ⬜.** The invite form and the role menu offer Editor and Viewer
only, and the API's validator rejects `owner` with `400`. A document therefore has exactly one
owner for its whole life — the creator. Consequences that follow, and are not bugs: the last-owner
rule (§2.1) can only ever fire on that one person, and there is no route to hand a document over.

**Entry points** — all three open the same panel:

| From | Who sees it |
|---|---|
| Dashboard row menu → **Share** | Owner only |
| Dashboard row menu → **Details** → **Manage access** | Owner only |
| Editor top bar → **Share** | Owner and Editor |

For a **Viewer** the entry point is **hidden, not greyed out**. An Editor can open the panel and
read the member list, but sees no invite form, no role menus and no remove buttons — not disabled
versions of them. Non-owners get **Leave** in the row menu instead of Share.

**Inviting**

- Email matching is **case-insensitive and whitespace-trimmed**: `  Ada@Example.com ` finds the
  account registered as `ada@example.com`.
- **The invitee must already have signed into DocSync.** An email with no account is **rejected**
  with `404 invite_user_not_found` and the message "No account found for that email". This is the
  behaviour that is merged, and it is what QA should test.
- **Pending invites are not built ⬜.** The intended design — record the invite, show a **Pending**
  row, grant access on that person's next sign-in — is specified in §18.2 and is the reason the
  `DocInvite` table exists in `schema.prisma` and in the database. **Nothing reads or writes that
  table.** Until it is built, onboarding someone new means asking them to sign in once first.
- **No invitation email is sent, and none is planned for Phase 1.** Sharing is silent: the person
  finds out because the document appears on their dashboard, or because the inviter told them.

**What an invite refuses**

| Attempt | Result |
|---|---|
| An email with no DocSync account | `404 invite_user_not_found` — "No account found for that email" |
| An email already on the document | `409 already_collaborator`, with `details.role` carrying their **current role**. No duplicate row |
| ~~An email already invited, unclaimed~~ | ⬜ Not reachable: there are no pending invites to collide with |
| Your own email | `409 already_collaborator` — you are already the owner. There is no separate self-invite message ⬜ |
| A malformed email | Inline validation, no request fired |
| `owner`, or any role that isn't editor/viewer (API only) | `400` — owner is not assignable (above) |

**Roles, removal and leaving**

- Each member row has a role menu, **owner only**; a change applies immediately for the owner.
- A member whose role changes while they have the document open **does not see it change live** —
  they pick it up on their next load. There is no live push in Phase 1.
- Owner removes a member → that person loses access; their next open shows the editor's
  "Couldn't load this document", and the row drops off their dashboard on refresh.
- Non-owner leaves via the row menu → the document disappears from their list; the owner keeps it.
- A non-owner cannot remove anyone but themselves — no UI for it, and `403` from the API.
- Removal is **not reversible** from a trash or undo. Getting back in means a re-invite.
- **The last-owner rule (§2.1) is enforced in the API, not just hidden in the UI.**
- **Ownership display follows the role, not the creator.** If the original creator is demoted or
  removed while a second owner exists, the "Owner" shown in the details drawer must move to the
  remaining owner — it must not keep naming the person who no longer owns it.

**Link access** — the *Anyone with the link* section is **rendered disabled with an explanatory
tooltip** and does nothing. That is intentional; public-link enforcement is a non-goal. A bug is
the control *looking* enabled or appearing to change something, not the control not working.

**Responsive** — desktop: the 420px right side panel, same treatment as the details drawer.
Mobile: a bottom sheet. Escape, the close X and a scrim click all close it. Closing mid-invite
discards the typed email; nothing is submitted implicitly.

### Two decisions that differ from the original spec

Both deliberate; neither is a bug.

| Original spec said | What is merged | Why |
|---|---|---|
| Reject an invite to an email with no account (`404 invite_user_not_found`) | **Exactly that** — the rejection. Pending invites were designed and lost before commit (§16.7); they are ⬜ in §18.2 | Rejecting makes it impossible to onboard a teammate who has not signed in yet — a real dead end, which is why the upgrade is still wanted |
| `DocCollaboratorDto` always carries `email` | **Only the owner sees email addresses.** For an editor, `email` is `null` and the UI shows names only. A viewer cannot fetch the list at all (`403`) | On a document shared between people who don't know each other, returning addresses to everyone leaked every member's email to every member |

### Tech spec

**Backend** — `routes/controllers/services/validators/collaborators.ts`, nested under
`/docs/:id/collaborators`.

| Endpoint | Role | Responses |
|---|---|---|
| `GET /docs/:id/collaborators` | **editor** | `200 { collaborators }` — no `invites` key, because there are no invites. `email` is the address for an owner and `null` for an editor. A viewer gets `403` (§2) |
| `POST /docs/:id/collaborators` | owner | `201 { collaborator }`; `400 bad_request` (including role `owner`); `404 invite_user_not_found`; `409 already_collaborator` with `details.role` |
| `PATCH /docs/:id/collaborators/:userId` | owner | `200 { collaborator }` (email included — owner-only route); `400 last_owner`; `404 not_found` |
| `DELETE /docs/:id/collaborators/:userId` | owner, **or** the caller targeting their own id | `204`; `400 last_owner`; `403 forbidden`; `404 not_found` |
| ~~`PATCH /docs/:id/invites/:inviteId`~~ | owner | ⬜ Not built — §18.2 |
| ~~`DELETE /docs/:id/invites/:inviteId`~~ | owner | ⬜ Not built — §18.2 |

Three enforcement details that are not obvious from the table:

1. **The DELETE split is narrower than `requireRole`'s single threshold** and must be enforced in
   the controller: load the caller's own role first, and only fall through to the owner check when
   `req.params.userId !== caller.id`.
2. **The last-owner rule is a data-integrity floor in the service layer**, not a product
   preference. It must hold under concurrency: two simultaneous requests each demoting one of two
   owners — exactly one wins, and the document must never end up ownerless.
3. **Invite claiming ⬜ is not built.** When pending invites land, claiming belongs in the OAuth
   login service (`services/oauth/login.ts`), not the collaborators service: it must run on every
   sign-in, converting matching `DocInvite` rows into `DocCollaborator` rows and deleting the
   invites. Today `login.ts` does no such thing, and nothing touches `DocInvite`.

**Frontend**

- `components/documents/share-panel.tsx` — invite form (email + role select), member list with
  owner-only per-row role menus, pending-invite rows, disabled link-access section.
- `lib/api/collaborators.ts` + `lib/documents/use-collaborators.ts` — the query and mutation hooks.
- Reuses the scrim + slide-in pattern from `mobile-nav-drawer.tsx`; no second overlay mechanism.
- Entry point hidden (not disabled) for viewers, in all three locations.

### Worth probing directly

- Concurrency on the last-owner rule (above). Covered by
  `services/collaborators.last-owner.test.ts`, which locks owner rows `FOR UPDATE`.
- `DELETE .../collaborators/:userId` as an Editor targeting the owner's id → must be `403`.
- `GET .../collaborators` as an **Editor** → `email` genuinely `null` in the JSON, not merely
  hidden by the UI. As a **Viewer** → `403`, with no member data in the body at all.

---

# Phase 2 — PWA & full offline ✅

**Goal:** make the promise in §1.2 literally true. Today the app *degrades* sensibly offline —
you can type, but you must reconnect and click Save yourself. After Phase 2, a Save made offline
lands on its own when the network returns, and the app opens at all with no network.

**Depends on:** Phase 1 (the Save endpoint and the five sync states already exist and need no
change). **Nothing in Phase 2 requires a new endpoint** — it is entirely client-side plus a
service worker.

## Phase 2 · Part 1 — App shell, manifest & caching ✅

### PRD

- The app is **installable** — it appears as a standalone app from the browser's install prompt,
  with its own icon and no browser chrome.
- Opening the app **with no network at all** reaches the dashboard and any document previously
  opened on that device, rather than the browser's offline error page.
- A document the user has never opened on this device is not available offline. The dashboard row
  for it renders, but opening it shows the same "Couldn't load this document" state as Phase 1,
  with the reason given as offline.
- Signing in is **never** served from cache.

### Tech spec

**Manifest** — name, icons (192/512), `display: standalone`, `start_url`, theme and background
colour. Nothing unusual; the interesting work is the service worker.

**Service worker** — hand-written, not `next-pwa`, for full control over caching and push.

- **Install / activate**: precache the app shell (JS/CSS bundles, fonts, offline fallback page).
- **Fetch handling by resource type:**

| Resource | Strategy | Rationale |
|---|---|---|
| App shell (JS/CSS/fonts) | **Cache First** | Rarely changes between deploys; instant load |
| Document content (`GET /docs/:id`) | **Stale-While-Revalidate** | Instant offline access, background freshness |
| Doc list (`GET /docs`) | **Network First**, cache fallback | Prefer a fresh list online, degrade gracefully |
| Auth endpoints | **Network Only** | Security-sensitive; must never serve stale auth state |
| Transcription (`POST /docs/:id/transcribe`, Phase 4) | **Network Only** + retry queue | Transcription needs network; the audio is queued instead (Phase 4.2) |

### Acceptance

- [ ] Install prompt appears; the installed app launches standalone
- [ ] Full airplane mode → app opens, dashboard renders from cache
- [ ] A previously-opened document opens offline with its content
- [ ] A never-opened document offline shows the load error, not a crash
- [ ] Auth endpoints are never served from cache (verify in the Network panel)

## Phase 2 · Part 2 — Background Sync & the save queue ✅

### PRD

This is the part the product is named for.

- Clicking **Save** while offline **succeeds as an action**: the change is queued, not refused.
  The Save button is enabled offline from this phase on — the Phase 1 behaviour of disabling it
  is superseded.
- The badge reads **Pending**, and the **pending-change count** is shown in two places: the
  editor top bar and the dashboard row.
- On reconnect the queue **replays in order**, the badge passes through **Reconnecting** and
  returns to **Saved** when the queue empties. The user does nothing.
- If two collaborators both saved divergent offline edits, both land — CRDT merges them
  automatically on the backend. There is no conflict prompt, the same as the always-online case.

**Queue limits (decided — see §16.2 for the reasoning).** The user is warned before the browser
can do anything destructive, and **nothing in the queue is ever discarded automatically**:

| Limit | Value | Behaviour at the limit |
|---|---|---|
| Total offline queue | **50 MB** | Warn at **40 MB** (80%). At 50 MB, new queue entries are refused with a clear message; existing entries are kept |
| Audio sub-cap within it | **25 MB** | A long dictation session can never starve the save queue |
| Single queued item | **5 MB** | Bounds one pathological entry |
| Age of the oldest queued change | **warn at 7 days** | A loud, persistent warning naming the document and the date. Never auto-discarded |

**Access revoked while a change is queued (decided).** On flush, a `403`/`404` moves that queue
item to a **rejected** state — never a silent discard. The editor shows *"You no longer have
access to this document. Your unsaved changes are kept on this device."* with a **Copy text**
action, and the local draft is retained. This matches the heartbeat case in Phase 3.1 and follows
directly from §1.2: silently deleting someone's work because a third party changed a permission is
exactly the trust failure this product exists to fix.

### Tech spec

- The SW registers a `sync` event for queued work. Phase 2 flushes **queued Saves** to
  `POST /docs/:id/save`; Phase 4 adds queued audio to the same mechanism.
- The queue lives in IndexedDB alongside the Yjs draft, so it survives a browser restart.
- **Order matters within a document.** Replay is sequential per doc; a failed item blocks that
  doc's queue rather than being skipped.
- **The token is re-validated when the queued Save finally sends**, not when it was queued (§7).
  A `401` on flush triggers the normal single-flight refresh-and-retry; a persistent failure
  surfaces rather than silently dropping the change.
- `connectivity` becomes app-level state fed by both `navigator.onLine` and SW signals — no
  component derives it for itself (§8).
- `pendingChangeCount` on `DocSummary` is finally populated; the Phase 1 badge needs no rework
  because the state vocabulary was fixed up front (§4.1).
- **Request persistent storage.** Call `navigator.storage.persist()` the first time anything is
  queued, and read `navigator.storage.estimate()` before each enqueue rather than trusting the
  50 MB budget blindly — the real remaining quota is what actually matters. §16.2.

### Acceptance

- [ ] Save while offline → badge **Pending**, count shown in editor and dashboard row
- [ ] Reconnect with the tab open → queue flushes, badge returns to **Saved**, no user action
- [ ] Reconnect with the tab **closed** → Background Sync still flushes
- [ ] Two devices save divergent offline edits → both land, merged, no prompt
- [ ] Queue survives a browser restart
- [ ] A queued save whose token expired refreshes once and retries, not logging the user out

### As built (Part 2)

- **The queue is IndexedDB** (`docsync-save-queue`), entries and payloads in separate stores so a
  count never reads the large half. Replay is oldest-first by index, sequential per document, and
  a failed item blocks only its own document.
- **The CSRF token is captured at enqueue.** A service worker cannot read `document.cookie` at
  replay time, so the value travels with the payload.
- **Background Sync with a fallback.** `sync` fires with the tab closed where it exists; Safari and
  Firefox get a `postMessage` on reconnect instead. Both run the same drain.
- **Limits are enforced on enqueue** (added after the first merge; they were specified but absent):
  50 MB budget, 40 MB warning, 5 MB per item, 25 MB audio sub-cap. `storage.persist()` is requested
  on the first enqueue and `storage.estimate()` is read before each one — the browser's real
  remaining quota outranks our own budget.
- **Over budget refuses the new entry**, naming the reason. Nothing queued is ever evicted.
  A `QuotaExceededError` on write drops re-fetchable cached documents (step 1 of §16.5) and retries
  once; queued work and drafts are never touched.
- **Seven days** of unsynced work raises a loud warning naming the document and the date (§16.2).
- **A flushed queue tells the page.** The worker sends queued saves, so the editor that made
  one would otherwise never learn it landed — the badge stayed on Draft over work the server
  held, and pressing Save pushed "updated this document" to every collaborator for nothing. On
  `SAVE_FLUSHED` the editor refetches and re-bases (`reconcileWithServer`), and the worker drops
  its cached `GET /docs/:id` first, since that copy is stale-while-revalidate and older than what
  it just sent.
- **`pendingChangeCount` is client-side**, read from the queue rather than served by the API: the
  queue lives on the device, so only that device can count it. Shown in the editor top bar and on
  the dashboard row.

## Phase 2 · Part 3 — Offline edge cases & update banner ✅

### PRD

| Scenario | Expected |
|---|---|
| New app version deployed while a document is open | An in-app **"Update available — refresh"** banner. The app must **not** reload itself mid-edit |
| Network drops after Save is clicked | Retried by Background Sync; badge goes Saving… → Saved once the backend confirms |
| Browser killed with unsaved edits | Draft restored on relaunch, badge still **Draft** |
| A collaborator's Save arrives while I hold unsaved local edits | My draft is not overwritten; the incoming change merges next time I save or reload |
| Local storage quota fills | A real `QuotaExceededError` evicts in a fixed order (below). Queued saves and drafts are **never** evicted automatically |

### Tech spec

- A new SW installs alongside the old one. **Do not call `skipWaiting()` automatically** — that
  yanks document state out from under a mid-edit user. The banner asks; the user decides.
- **Eviction order on `QuotaExceededError`** — strictly in this order, stopping as soon as there
  is room:
  1. Cached documents not opened recently — they are re-fetchable from the server.
  2. Raw audio whose transcript already exists — the transcript is the part with value.
  3. Refuse new dictation recordings, with a message.
  4. Stop. **Queued saves and local drafts are never evicted.** If there is genuinely no room for
     a save, refuse the *new* one loudly rather than dropping an older one.
- **Encourage installation.** An installed PWA is exempt from WebKit's 7-day script-writable-
  storage eviction, which is the single biggest threat to a long-lived queue on iOS (§16.2).

---

# Phase 3 — Presence & push notifications ✅

**Depends on:** Phase 1's Save endpoint, finished a phase ago.

⚠️ **Push was absent from the PRD entirely** — not a goal, not a requirement, not even a non-goal.
It was built anyway, on an explicit instruction to implement all of Phase 3. §18 conflict 1 is
therefore **resolved by decision, not by the PRD**: push is in the product. If the PRD is ever
reconciled, this is the section that has to change.

## Phase 3 · Part 1 — Draft backup & presence ✅

### PRD

- While a document is open, the user's draft is **backed up to the server** every ~20–30s. This
  is not autosave: it never merges into the canonical document, never notifies anyone, and is
  readable only by the user who wrote it. It exists so a draft survives cleared storage or a
  device the user never returns to.
- The editor top bar shows **presence chips** — "Priya has this doc open". The slot reserved in
  Phase 1 is finally wired.
- Scope is **open / not-open only**. No cursor position, no typing indicator, no live text.
- If the heartbeat lands after the document was deleted or access revoked, the user gets an
  explicit **"you no longer have access"** state rather than a silent failure.

### Tech spec

- `POST /docs/:id/draft` (**viewer+**, not editor+ — see §16.6) — **one request, two purposes**:
  it stores the private draft backup keyed to `(docId, userId)` *and* marks the user present. No
  separate heartbeat request, so presence adds no extra chattiness. A viewer sending an `update`
  is rejected with `403`; a viewer sending an empty body is a normal heartbeat.
- `GET /docs/:id/draft` (viewer+, own row only) — reads the caller's own backup. Added during
  implementation: a backup that cannot be read back is not a backup.
- ⚠️ **The restore half is not wired up 🚧.** The endpoint exists and is tested; the client never
  calls it. `lib/api/presence.ts` exports `fetchOwnDraft` and nothing imports it, and `useYjsDoc`
  seeds only from the document's server snapshot. So a draft backed up from a device whose local
  storage was later cleared is **written but unreachable** — which is exactly the case §4.1 says
  the backup exists for. `lib/api/presence.draft-restore.test.tsx` fails on purpose to hold this
  open; it is the one deliberately red test in the suite. Deciding between applying the backup
  automatically and offering an explicit **Restore** control is the open part — §18.2.
- Two tables, not one: `DocDraft` and `DocPresence`. They are written by the same request but are
  independent facts — a viewer is present with no draft, and a failed draft write must not cost
  someone their liveness. Collapsing them would also couple a privacy-bearing blob to a row
  rewritten every 25 seconds.
- `GET /docs/:id/presence` (viewer+) — polled client-side every ~15–20s while a document is open.
- The server keeps a short-TTL record per `(docId, userId)` in Postgres (`DocPresence.lastSeenAt`)
  — **no Redis**. Postgres over an in-memory map so presence survives a restart and is correct
  with more than one API instance.
- **Role is read from the ACL at list time, not stored on the presence row.** Presence keys off
  `User`, so a removed collaborator's row outlives their access; resolving the role on read is
  what keeps them from lingering in everyone else's chips.
- **TTL ~60s, roughly 2× the heartbeat interval.** If heartbeats stop — tab closed, browser
  crashed, network dropped — the entry expires on its own. **No explicit "leaving" signal**,
  which is what makes this robust in an app where a clean disconnect cannot be guaranteed.
- Given the periodic backup, a blocking `beforeunload` confirmation is unnecessary in the common
  case. Keep a lightweight one only for the narrow window before the *first* backup tick fires.
- Presence is shown only for users who currently hold at least Viewer access.

**Client behaviour.** `useDraftBackup` beats immediately on open rather than waiting a full
interval — a tab closed in the first 25 seconds would otherwise have backed up nothing, which is
the exact window the `beforeunload` fallback exists to cover. A `403`/`404` on a beat is the
signal for "you no longer have access"; a network failure or a `5xx` is deliberately *not*, since
telling someone their access is gone because the wifi dropped is worse than saying nothing.

⚠️ The draft-backup endpoint remains unspecified product surface — it appears in no PRD
(§18 conflict 8).

## Phase 3 · Part 2 — Push notifications ✅

### PRD

- On first login (or an explicit opt-in), the user is asked to allow notifications.
- When a collaborator **saves** a document, every other subscribed collaborator is notified —
  **including when the app is fully closed**. That is the point of the feature.
- Tapping the notification deep-links to `/doc/:id`.
- If the recipient already has that document open and focused, they get an **in-app toast or
  badge update instead of an OS notification** — not both.
- Rapid repeated saves by the same editor (fixing a typo right after saving) collapse into a
  **single** notification.
- Push permission denied → in-app toasts and badges still work while the app is open; there is no
  OS-level notification and nothing else degrades.

### Tech spec

- `POST /push/subscribe` / `DELETE /push/subscribe` (authed) — the client calls
  `pushManager.subscribe()` with the VAPID public key and sends the subscription object, stored
  per user in `PushSubscription`.
- **Trigger:** the backend sends Web Push to a document's other subscribed collaborators as soon
  as a Save is merged. No keystroke-spam debounce is needed — edits don't reach the server until
  Save. A **5-second per-document debounce** is still applied (restart the timer on each new Save,
  fire once it goes quiet): long enough to catch a quick follow-up correction, short enough that
  the notification still feels immediate.
- **Targeting:** every subscribed collaborator except the saving editor, and only those with at
  least Viewer access. There is no server-side "active connection" concept to filter on — the
  *receiving* client's SW checks `clients.matchAll()` in its `push` handler and suppresses the OS
  notification when that document is already open and focused in one of its own tabs.
- **Payload:** `{ docId, docTitle, editorName, changeSummary }` — kept small; push payloads are
  size-limited.
- **Change attribution** for the copy ("Priya added 3 lines") is the **difference in line count**
  between the snapshot before the merge and after it (`describeChange` in `services/docs.ts`).
  *Decided September 15 2026*, closing a conflict QA raised twice: `techspec.md` §4 said the
  client-id embedded in the Yjs update should be used instead. The line-count delta is what is
  built, it needs no awareness state, and it is honest about what it knows. Its one weakness is
  recorded rather than hidden: **any edit that leaves the line count unchanged reads "edited this
  document"**, including a no-op save.
- SW `notificationclick` → focus an existing client or `clients.openWindow()`, deep-linked to the
  document. A "Mark as read" action is a later iteration.

**Service worker ownership.** Phase 2 owns `public/sw.js`; Phase 3 put the push and
`notificationclick` handlers in **`public/sw-push.js`**, pulled in by one `importScripts` line at
the top of `sw.js`. Nothing cache- or fetch-related is in that file. The minimal `sw.js` shipped
here is a placeholder for Phase 2 to build out — it deliberately omits `skipWaiting()` already,
per techspec 3.2.

**Degrades to off, never to broken.** With no VAPID keys configured the server reports
`publicKey: null`, `queueDocSavedNotification` is a no-op, and the UI hides the toggle entirely
rather than offering a control that cannot work. A developer with no keys gets a working app with
no notifications.

**Known limitation — the debounce is per-instance.** It is an in-memory `Map`, so two API
instances would each debounce their own traffic and could send two notifications for one burst.
The failure mode is a duplicate buzz, not a lost or misdirected one; a shared store is out of
scope at this size.

---

# Phase 4 — Speech-to-text ✅

**Depends on:** Phases 1–3. Fully separate surface; nothing else depends on it.

## Phase 4 · Part 1 — Dictation panel & transcription ✅

### PRD

Designs `4a`–`4e`, `6g`. Flow: toolbar entry point (**Dictate**) → 420px panel idle → recording with a live
level meter → transcript ready → **Insert at cursor** → document updated. On mobile the panel is
a bottom sheet.

- **Dictation never writes into the document by itself.** Audio is transcribed into a local,
  per-user panel; the user reviews and edits the transcript, then explicitly inserts it at the
  last-known cursor position or copies it. This is a correction step, deliberately placed before
  imperfect transcription can reach a shared document — and it avoids racing concurrent editors.
- Panel state persists per document, so an interrupted dictation session isn't lost.
- **Mic permission denied** → an inline error in the panel; typing remains fully available.
- **Offline** → recording is disabled with an inline hint until Part 2 lands; a recording in
  progress when the connection drops is stopped. Typing is unaffected.
- A transcription that fails is kept in memory with **Retry** / **Discard** — the recording is
  not thrown away because the service was busy or down.
- **Viewers have no dictation entry point at all** — hidden, not disabled, consistent with how
  Share is treated for viewers in Phase 1.3. *(Decided: §16.1.)*

### Tech spec — self-hosted `faster-whisper`

Transcription is **self-hosted**, not a cloud API. Two processes, one boundary:

```
browser ──audio──▶ Node API :3000 ──audio──▶ Python STT :8000 ──▶ faster-whisper
                   auth, role, CSRF,          no auth, no session,
                   size + type caps           127.0.0.1 only; 60 s cap
```

**Node API — the auth boundary**

- **`POST /docs/:id/transcribe` (editor+)** is the only thing the browser talks to. It is
  doc-scoped (not `/stt/transcribe`) so `requireRole` reads the doc id from the path and gives
  the usual 404/403 split with no special case. Everything the app knows about permissions stays
  in one place.
- **Request:** `multipart/form-data` with one `audio` file. **Response:** `{ transcript }`
  (`TranscribeResponse`).
- **Order:** `requireAuth` → `requireRole('editor')` → multer → controller. The role check runs
  before the upload is parsed, so a viewer's or stranger's audio is never read. CSRF is the
  global guard, as for every mutation.
- **multer uses memory storage** — the audio is never written to disk on the Node side.
- **Caps enforced here, before forwarding:** 10 MB (`413 audio_too_large`) and
  `audio/webm` or `audio/ogg`, codec parameters ignored (`415 unsupported_audio_type`). A missing
  file is `400 audio_missing`.
- **Forwarding** (`services/stt.ts`) posts the audio to `STT_URL` (default
  `http://127.0.0.1:8000`) with a 30 s timeout. Codes a client can act on pass through with the
  same code: `503 stt_busy`, `413 audio_too_long`, `422 audio_unreadable`. Anything else — an
  unexpected status, a malformed body, a timeout, a refused connection — becomes
  `503 stt_unavailable`, with none of the service's internals in the response.

**Python STT service — `apps/stt/main.py`**

- **A dumb transcribe-this-blob service.** No session, no user id, no database, no auth of its
  own. It is never published to the internet: in dev it runs from a local venv bound to
  `127.0.0.1` (`apps/stt/README.md`). Giving it an auth surface would mean a second
  implementation of the rules in §2 and §7, which is how they drift.
- **One file, one route** (`POST /transcribe`, multipart `audio`) plus `GET /health`. The model is
  loaded **once at process start**, never per request.
- **Model: `small` with `int8` on CPU** by default. ~141 MB, roughly 5–7% WER, no GPU required,
  and it runs acceptably on a laptop — which matters because everyone on the team has to be able
  to run the stack. `WHISPER_MODEL` / `WHISPER_COMPUTE_TYPE` / `WHISPER_DEVICE` env vars let a GPU
  box switch to `medium` or `large-v3` with `float16` without a code change. Do not start at
  `large-v3`: 2.9 GB and a GPU requirement is a large tax for a ~2-point WER gain on short
  dictation.
- **Concurrency: one transcription at a time, no wait queue.** faster-whisper does not want
  parallel calls on one model instance. A request that arrives while one is running gets
  `503 stt_busy` immediately; inference runs in a worker thread so `/health` stays responsive.
  The client absorbs the busy case (below). A Celery/Redis worker is the right shape later, but
  it is more machinery than an MVP needs.
- **The 60 s cap lives here**, because checking duration means decoding the audio. It is checked
  after decoding and before the model runs (`413 audio_too_long`). Audio that cannot be decoded is
  `422 audio_unreadable`; a non-WebM/Ogg part is `415`.
- **Latency:** measured ~2.4 s for a short sentence with `small` on a laptop CPU. The panel shows a
  transcribing state; this is a review-then-insert flow, not live captioning.

**Audio retention: discarded, never persisted. (Decided: §16.1.)**

- The audio is written to a `tempfile` inside a `with` block for the length of one request, and
  the file is deleted when the block exits — whether the transcription succeeded or failed.
- **Nothing writes audio to Postgres, and the service keeps no audio directory.**
- No logging of audio bytes or transcript text.
- There is **no** debug flag to keep audio. If one is ever added, it must default to off and
  refuse to start when `NODE_ENV=production`.

Rationale: dictation is the most sensitive input surface in the product — it is uncommitted
scratch the user has not yet chosen to put in a shared document, and it captures whatever
happened to be audible in the room. Self-hosting already means the audio never leaves our
infrastructure; discarding it means there is no audio corpus to leak, subpoena, or have to write a
retention policy for.

**Client side**

| Module | Role |
|---|---|
| `components/documents/dictation-panel.tsx` | `DictationControl` (toolbar button + state owner) and the panel, built on the shared `PanelShell` |
| `lib/dictation/use-recorder.ts` | `MediaRecorder` (`audio/webm;codecs=opus`, else `audio/ogg;codecs=opus`), level meter, auto-stop at 60 s, releases the mic on stop |
| `lib/dictation/use-dictation.ts` | Transcript state, IndexedDB persistence, the upload queue, failed recordings |
| `lib/dictation/transcript-store.ts` | IndexedDB `docsync-dictation` → `transcripts`, keyed by doc id |
| `lib/dictation/insert-text.ts` | Pure insert-at-selection with space padding |
| `lib/api/dictation.ts` | `transcribeAudio(docId, blob)` |

- The transcript lives in IndexedDB, one entry per document. **Explicitly not synced through
  Yjs** — it is local scratch until committed, and putting it in the CRDT would replicate one
  user's half-finished dictation to everyone. Only text is stored; no audio is kept client-side
  in Part 1.
- **State is owned by `DictationControl`, which stays mounted with the editor**, not by the panel.
  Closing the panel (Escape, close control, scrim) mid-recording stops the recording and still
  transcribes it; the text is there when the panel reopens. A transcript that arrives after the
  editor itself unmounts is written straight to IndexedDB.
- **Uploads are sequential.** Each recording waits for the previous one, so transcripts land in
  the order they were spoken and our own second chunk never collides with the first in the
  single-slot service. `stt_busy` is retried after 1 s, 2 s and 4 s before it counts as a failure.
- Each new transcript is appended to the panel text with a single space. The user can edit it
  freely before inserting.
- **Insert at cursor** uses the last selection the user left in the body (tracked on `select`),
  clamped to the current length; with none, the text goes at the end. It pads with a space where
  it would run into a word, then goes through `setBody` — an ordinary Yjs edit that follows the
  normal draft → Save path. **Dictation creates no new save semantics.** Afterwards the
  transcript is cleared and the panel closes.
- Copy uses the clipboard; Clear empties the transcript.

### Acceptance

- [x] Viewers have no Dictate button; owners and editors do
- [x] `POST /docs/:id/transcribe`: editor/owner 200, viewer 403, non-collaborator 404, no
  session 401, no CSRF header 403 — and the STT service is not called in any rejected case
- [x] 10 MB and type caps return 413 / 415 before forwarding; STT errors map to stable codes
- [x] Record → transcript appears in the panel → nothing reaches the document until **Insert at
  cursor** → the text lands at the last cursor and the doc shows Draft
- [x] Two quick recordings transcribe in spoken order
- [x] Blocked mic shows an inline error; typing still works
- [x] Offline disables recording with a hint
- [x] A failed transcription can be retried with the same audio
- [x] Closing the panel mid-recording still transcribes; the transcript survives a remount
- [x] Real service: speech transcribed; junk → 422, wrong type → 415, concurrent → 503,
  65 s → 413
- [ ] Manual check in a real browser with a real microphone (tests use a fake `MediaRecorder`)

## Phase 4 · Part 2 — Offline audio queue ✅

### PRD

- Recording while offline **works**. The panel shows a *"queued — will transcribe when back
  online"* placeholder instead of a transcript.
- On reconnect the queued audio transcribes automatically and each placeholder resolves into its
  transcript segment, in place.
- Raw audio is never discarded because the network was down.

### Tech spec

- Raw audio is cached in IndexedDB and flushed by the **same Background Sync mechanism** built in
  Phase 2 Part 2 — a second queue kind alongside queued Saves, not a second mechanism.
- **Depends on Phase 2 Part 2**, which is not built. Until then Part 1 disables recording offline
  (§Phase 4 Part 1).
- The transcribe call stays Network Only; it is the *audio*, not the request, that is queued.
- Audio is bound by the **25 MB sub-cap** inside the 50 MB offline budget (Phase 2.2) — roughly
  25–50 minutes of Opus-encoded speech, and deliberately less than the whole budget so dictation
  can never crowd out a queued document save.
- Once a chunk's transcript has been received, **delete the raw audio locally too.** It is the
  first thing evicted under quota pressure (Phase 2.3) and there is no reason to keep it.

### As built (Part 2)

- Audio is queued as a second **entry kind** in the Phase 2 queue, not a second mechanism, and is
  bound by the 25 MB audio sub-cap.
- **The Blob is stored directly** in IndexedDB rather than base64, so a recording is not inflated by
  a third on the way in.
- **The page flushes audio, not the service worker.** A transcript has to land in the dictation
  panel's store and be reviewed before it can reach the document, so the worker deliberately skips
  audio entries — sending one to `/save` would corrupt the document. This is the one place Part 2
  departs from "the same Background Sync mechanism": the queue is shared, the flush is not.
  The consequence is that a queued recording transcribes when the app is next open, not while it
  is closed.
- The panel shows a **queued placeholder** per waiting recording, and each recording is deleted as
  soon as its transcript arrives. A recording made offline is never discarded.
- **Recording offline is now allowed**, superseding Part 1's disabled-offline button.

---

# Phase 5 — Polish & integration ⬜

Not a solo round. This is where the timing bugs that only appear across
Save → push → notification → reload get found.

## Phase 5 · Part 1 — Deferred product surface ⬜

Each item here is currently a known, deliberate gap. Shipping them means answering the question
behind them first:

| Item | Current state | Blocked on |
|---|---|---|
| Working "Anyone with the link" access | Rendered disabled with a tooltip | Explicit non-goal — needs a product reversal, not just implementation |
| Version history / restore | **Data retained from Phase 2, UI deferred; sign-in copy to be corrected now** | Decided — §16.3 |
| Ownership transfer | No action; the invite-as-owner-then-demote route is the only path | Known dead end (§2.1) |
| Access requests ("ask the owner") | Not planned | — |
| Invitation emails | Nothing in the product sends mail; pending invites are silent | — |
| **Need help?** on sign-in | **Becomes a link to a static in-app `/help` page** | Decided — §16.4 |

## Phase 5 · Part 2 — Integration pass ⬜

- Multi-window demo rehearsal: two browsers, two accounts, one document, network toggled.
- The full §Phase 2 Part 3 edge-case table, verified rather than assumed (Phase 2 is built; the
  table has not been walked end to end on real devices).
- SW update banner under a real deploy.
- The complete role matrix (§2) re-verified end to end, at the API layer as well as the UI.

---

## 16. Resolved decisions

Every question that was open at the time of writing has now been answered. This section records
each decision **with its reasoning**, so a later reader can tell a considered call from an
accident. The phase sections above state the decisions; this one says why.

### 16.1 Dictation — viewers, and audio retention

**Viewers get no dictation panel.** Hidden entirely, not disabled — consistent with how the Share
entry point is treated for viewers (Phase 1.3). A viewer cannot insert and cannot Save, so a
dictation panel would be a surface whose only outcome is a transcript the product then refuses to
do anything with. If personal scratch notes turn out to be a real need, that is a notes feature,
not a half-working editor control.

**Audio is discarded after the request; nothing is persisted server-side.** Held in memory on
the Node side and in a tempfile on the STT side for one request, deleted when the request ends,
no Postgres column, no audio directory. Dictation captures uncommitted speech and whatever else was audible in the room — it is
the most sensitive input in the product. The strongest retention policy is having no corpus to
retain. Self-hosting (below) already keeps the audio inside our own infrastructure; discarding it
removes the rest of the problem.

**Transcription is self-hosted `faster-whisper` behind the Node API.** Full architecture in
Phase 4.1. The shape of the decision:

| Choice | Why |
|---|---|
| Separate Python FastAPI service, not in the Node process | `faster-whisper` is a Python library; the Node API stays thin (§3) |
| Node keeps the public endpoint and does all auth | One implementation of §2 and §7. A second auth surface is how rules drift |
| Python service internal-only (bound to `127.0.0.1`), no auth of its own | It cannot be reached from the internet, so it has nothing to get wrong |
| `small` + `int8` on CPU as the default | ~141 MB, ~5–7% WER, no GPU, runs on a laptop — everyone on the team can run the stack |
| Model and compute type behind env vars | A GPU box moves to `medium` / `large-v3` + `float16` with no code change |
| One transcription at a time, `503 stt_busy` for anything else; the client sends sequentially and retries busy | One model instance does not want parallel calls, and a wait queue only moves the failure to a timeout |
| 10 MB / type caps in Node before forwarding; 60 s cap in the STT service before the model runs | Size is checkable without decoding, duration is not. Either way a long upload cannot pin the model |
| Doc-scoped endpoint, `POST /docs/:id/transcribe` | `requireRole` reads the doc id from the path; `/stt/transcribe` would have needed a special case |
| One `main.py` run from a local venv, not a container | Same shape as the team's earlier voice service; nothing to learn before running the stack |

Starting at `large-v3` was considered and rejected: 2.9 GB and a GPU requirement is a heavy tax
for roughly a two-point WER gain on short dictation that a human reviews before inserting anyway.

### 16.2 Offline queue — retention caps and revoked access

The numbers are anchored to what browsers actually enforce, not picked for roundness.

**What the platforms give us, as of 2026:**

| Browser | Per-origin quota |
|---|---|
| Chrome / Edge | Up to ~60% of total disk per origin (~80% across all origins); incognito ~5% |
| Firefox | The smaller of 10% of disk or 10 GiB (best-effort); up to 50% of disk if persistent storage is granted |
| **Safari** | **~1 GB to start**, then prompts the user for more in 200 MB increments |

**Safari is the binding constraint**, and it is the one that shows the user a prompt — so the
budget is set well below it and we never trip one.

| Limit | Value | Reasoning |
|---|---|---|
| Total offline queue | **50 MB** | ~5% of Safari's ~1 GB floor. For plain text this is effectively unbounded — a Yjs update for a text edit is typically well under 10 KB, so 50 MB is thousands of queued saves. It is audio that will ever reach it |
| Warn at | **40 MB (80%)** | Early enough to act on, late enough not to nag |
| Audio sub-cap | **25 MB** | ~25–50 min of Opus speech. Half the budget, so dictation can never crowd out a queued document save — saves are the thing the product promises never to lose |
| Single item | **5 MB** | Bounds one pathological entry |

**The time limit is 7 days, and it is not arbitrary.** WebKit deletes script-writable storage —
IndexedDB, LocalStorage, Service Worker registrations — for an origin with no user interaction in
the last seven days of browser use. A queued change older than that is at genuine risk of being
deleted *by the browser*, not merely stale. So at 7 days the app warns loudly, naming the document
and the date. It never discards on its own.

Two mitigations follow from the same fact:

- **`navigator.storage.persist()`** on first enqueue — in Firefox this lifts the cap to 50% of
  disk and exempts the origin from best-effort eviction.
- **Encourage installing the PWA.** A web app added to the home screen is not part of Safari and
  keeps its own usage counter, so it is exempt from the 7-day eviction. On iOS this is the single
  most effective thing a user can do to protect a long-lived offline queue.

**A queued Save whose access was revoked is rejected and surfaced, never silently discarded.** The
item moves to a `rejected` state, the user is told they no longer have access, the local draft is
kept, and a **Copy text** action is offered. Silently deleting someone's work because a third
party changed a permission is precisely the failure §1.2 says this product exists to fix — and the
heartbeat path already behaves this way (Phase 3.1), so this is consistency, not a new rule.

**Nothing is ever evicted from the queue automatically.** Over budget, the app refuses the *new*
entry and says so. Dropping the oldest would be exactly backwards: the oldest entry is both the
most at risk and, having survived longest unsaved, the most likely to be the one the user cares
about.

*Platform figures checked September 2026 against
[MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
and [WebKit — Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
Re-check before Phase 2 ships; these numbers move.*

### 16.3 Version history — retain the data, defer the UI, fix the copy now

Three parts, because the conflict has three parts:

1. **Change the sign-in copy now.** The shipped login screen promises users "a full version
   history behind every save". That is the only part causing active harm — it is a promise to real
   users that the product does not keep. It costs one line to fix.
2. **Retain the append-only Yjs update log from Phase 2 onward**, even with no UI on it. It is a
   few bytes per save, and it is the difference between building history later and building it
   with a hole where the first year's data should be. Compact to a fresh snapshot every ~50 saves
   to bound storage (§3.1) but keep the log.
3. **Defer the restore UI** past Phase 5. It is a whole surface — a timeline, a diff, a restore
   confirmation, and a decision about what restoring does to other people's queued offline
   changes. It is not a Phase 5 polish item and should not be smuggled in as one.

This keeps the door open at near-zero cost while removing the dishonest copy immediately. It does
mean deciding the retention *depth* before Phase 2 ships — "all of it, compacted" is the
recommendation until there is a volume problem.

### 16.4 "Need help?" links to a static in-app help page

`/help`, a plain page in the app, covering sign-in, offline behaviour and sharing. Rejected: a
contact form (needs a backend, an inbox and spam handling, all to answer questions a page could
answer) and a support chat (a third-party script on the login screen, plus someone has to staff
it).

**Until that page exists, remove the link rather than leaving it inert.** A control that visibly
does nothing is worse than an absent one: it teaches users the UI is unreliable, and it is
indistinguishable from a bug to anyone testing.

### 16.5 Storage quota handling

Covered by the caps in §16.2 plus a fixed eviction order when the browser genuinely raises
`QuotaExceededError` (Phase 2.3): re-fetchable cached documents first, then raw audio that has
already been transcribed, then refuse new recordings. **Queued saves and local drafts are never
evicted automatically** — if there is no room for a save, the new one is refused loudly rather
than an old one being dropped quietly.

Read the real numbers with `navigator.storage.estimate()` rather than trusting the 50 MB budget:
a device that is nearly full, or an incognito window capped near 5%, will hit the platform limit
long before our own.
### 16.6 The presence heartbeat is viewer+, not editor+

The Phase 3 design said `POST /docs/:id/draft` was editor+, because it carries a draft. But §2's
role matrix says viewers **appear in presence** — and "who has this document open" is a question
about attention, not write access. A reader looking over your shoulder is exactly what the chips
are for.

Gating the route at editor would have meant either a second endpoint purely so viewers could
announce themselves, or viewers silently missing from every presence list. Instead the route is
viewer+, and the *payload* is what the role gates: a viewer sending an `update` gets `403`, a
viewer sending an empty body gets an ordinary heartbeat.

### 16.7 Phase 1 Part 3 — resolved by correcting the document

**This entry is closed.** It used to say that §Phase 1 Part 3 described two things that were built,
staged and lost before commit — pending invites and owner-only email visibility — and that someone
had to either rebuild them or correct the text. Both halves have now been settled, in opposite
directions:

| Half | Outcome, September 15 2026 |
|---|---|
| **Owner-only email visibility** | **Built.** `GET /docs/:id/collaborators` returns `email` to owners and `null` to editors, and is gated at editor+ so a viewer cannot fetch the list at all (§2). Covered by `routes/collaborators.email.test.ts` |
| **Pending invites** | **Still not built**, and the section no longer claims otherwise. §Phase 1 Part 3 now describes the merged rejection behaviour; the intended upgrade is specified in §18.2 |

The rule this leaves behind, and the reason the entry stays in the document: **a phase section
describes what is merged.** Anything wanted but absent is marked ⬜ and listed in §18.2, so no
reader has to diff prose against code to find out which they are holding.


---

## 17. Open questions

**None currently open.** Every question carried from `techspec.md` §12 and `DocSync-PRD.md` §13
has been answered — see §16 for the decisions and §18 for the PRD/spec conflicts they close.

| # | Question | Outcome |
|---|---|---|
| 1 | Should Viewers get the dictation panel? | **No** — hidden entirely. §16.1 |
| 2 | Is transcription audio cached server-side? | **No** — self-hosted and discarded after the request. §16.1 |
| 3 | Autosave cadence vs. explicit Save | **Explicit Save is authoritative**, confirmed by product |
| 4 | Retention limit on queued offline changes | **50 MB / 40 MB warning / 7 days.** §16.2 |
| 5 | Version history depth, and whether restore ships | **Retain the log, defer the UI, fix the sign-in copy now.** §16.3 |
| 6 | A queued Save targets a doc the user lost access to | **Reject and surface; keep the local draft.** §16.2 |
| 7 | What **Need help?** opens | **A static in-app `/help` page**; remove the link until it exists. §16.4 — link now removed |
| 8 | Local storage quota handling | **Fixed eviction order; queued saves never evicted.** §16.5 |
| 9 | May a **Viewer** see the member list? | **No.** The §2 matrix is authoritative; `GET /docs/:id/collaborators` is editor+ and the details drawer hides members and the owner row from viewers. *Decided 15 Sep 2026* |
| 10 | May an **Editor** rename a document? | **No — owner-only stands.** `PATCH /docs/:id` stays owner-gated, matching §2. QA Run 1 recorded the opposite as a "product bug"; that note is superseded by this line. *Decided 15 Sep 2026* |
| 11 | How is push change-attribution derived? | **Line-count delta**, not the Yjs client-id. §Phase 3 Part 2. *Decided 15 Sep 2026* |

New questions belong here as they arise, with the same rule as before: **none should be resolved
by whoever implements the surrounding code without asking.**

## 18. Reconciliation — where the PRD and the tech spec disagree

Inherited from `techspec.md` §16. Where the two agreed, this document states the agreed position
and the conflict is gone. These are the genuine ones still open.

| # | Conflict | Tech spec says | The PRD says | Impact |
|---|---|---|---|---|
| 1 | ~~**Push notifications**~~ | A §1.1 goal, a whole section, and all of Phase 3.2 | **Absent entirely** — not a goal, not a requirement, not even a non-goal | **Resolved by decision, not by the PRD.** Phase 3.2 was built on an explicit instruction and is shipped: push is in the product. The PRD has not been amended, so §18.1 records it as superseded |
| 2 | ~~**Version history**~~ | A non-goal | Sold in the summary, the goals, and the sign-in screen's shipped copy | **Resolved — §16.3.** Retain the update log from Phase 2, defer the restore UI past Phase 5, and correct the sign-in copy now |
| 3 | **"Live" presence** | §7 is a ~20s poll; real-time is an explicit non-goal | "live presence on each document" | **Read as "current", and that reading is now shipped**: chips show who has the document open, refreshed on a poll, with no cursors or typing indicators. The word "live" in the PRD is wording, not a requirement for streaming. Still worth an explicit product confirmation |
| 4 | ~~Autosave vs. Save~~ | — | — | **Resolved** — explicit Save is authoritative |
| 5 | **Icon library** | `lucide-react`, already in use | "no external icon packs… all icons inline SVG on a 24×24 grid at `stroke-width:1.7`" | Replacing lucide means hand-authoring every icon. Cheap now, expensive after the editor lands |
| 6 | **Radius scale** | One `--radius: 0.375rem` knob, emitting 4.8 / 6 / 8.4 / 10.8px | `8px / 6px / 12px`, pills 999px | 6px matches; 8px is 8.4px; **12px has no step** (nearest 10.8px). Retune the knob or accept the drift |
| 7 | **Badge border tokens** | Not in the palette; badges use `border-success/25` etc. | Component spec implies bordered badges | Works, but as an alpha of the accent rather than a real token. Restoring `--brand-border` (`#C6D0F6`, supplied then dropped) settles it |
| 8 | **Draft backup endpoint** | §Phase 3.1 — private per-user backup doubling as the presence heartbeat | No mention | **Kept, by the same decision that shipped Phase 3.** It remains unspecified product surface: no PRD line describes it, and its restore half is unbuilt (§18.2) |

### 18.1 PRD statements this document supersedes

`DocSync-PRD.md` is kept **verbatim** as the original brief, so it still contains lines the product
has since moved past. They are listed here rather than edited there, because a brief that quietly
changes is no longer a record of what was asked for.

**For QA: where this table and the PRD disagree, this table wins.** Nothing below is a bug.

| PRD line | What is true now | Why |
|---|---|---|
| §3 Goals: "live presence and **full version history** behind each save" | Presence yes (poll-based). **No version history** — no log, no restore UI | §16.3: retain the log from Phase 2, defer the UI past Phase 5. The sign-in copy that repeated this promise has been corrected |
| §4 Users: Owner "deletes and **moves** documents" | No move, no folders | Folders are a §1.4 non-goal, so there is nowhere to move a document to |
| §6.2: row menu "owner gets rename, share, **move**, delete" | Owner gets rename, share, details, delete. Non-owner gets duplicate, leave | Same reason. `RowOverflowMenu` follows §2 |
| §6.3 sync states: "Synced / Pending / **Reconnected**" | One vocabulary everywhere: `unsaved` / `saving` / `saved` / `offline` / `reconnecting`, shown as Draft / Saving… / Saved / Offline / Save failed | §4.1. `pending` and `reconnecting` only become reachable when Phase 2 lands the queue |
| §6.3: "Presence: avatar stack… **clicking opens a popover** listing who is in the document" | Chips with a combined label and tooltip. **No popover** | Phase 3.1 scope is open/not-open. A popover is a Phase 5 polish item, not a gap |
| §6.4: "Invite by email with a role select (**Owner** / Editor / Viewer)" | Editor / Viewer only; `owner` is rejected with `400` | §Phase 1 Part 3. Owner invites are ⬜ — §18.2 |
| §6.4: "A **link-access section** controls document-level link permissions" | The section is rendered **disabled** with an explanatory tooltip and does nothing | Public links are a §1.4 non-goal. The bug would be it *looking* functional |
| §6.4: "the same list renders inside the details drawer" | True for owners and editors. **Viewers see no member list at all** | §2 role matrix, decision §17 Q9 |
| §7 Sync model: offline edits "queue" and replay on reconnect | Editing offline works and drafts persist locally, but **Save is disabled offline** and there is no queue | Background Sync is Phase 2 ⬜. Coming back online does not auto-save |
| §11 Assets: "no external icon packs… inline SVG on a 24×24 grid" | `lucide-react` | Unresolved — §18 conflict 5. A design call, not a QA finding |
| §9 Design system: radii `8px / 6px / 12px` | One `--radius` knob emitting 4.8 / 6 / 8.4 / 10.8px | Unresolved — §18 conflict 6 |
| §6.5: dictation panel is **380px** | **420px** — the dictation panel reuses the shared `PanelShell` (same as the share panel) | One overlay mechanism (§6.1). Decided 17 Sep 2026 |
| §13 Open questions 1–6 | All six are answered | §17 |

### 18.2 Specified, agreed, and not built

Everything here is wanted and described somewhere above. None of it exists in the code. **QA should
not write tests that expect these to work**, and a tester meeting one of them has found a known
gap, not a defect.

| Gap | Where it is specified | What exists today | Blocked on |
|---|---|---|---|
| **Pending invites** — invite an email with no account, `DocInvite` row, Pending row in the panel, claimed at next sign-in | §Phase 1 Part 3, §16.7 | `404 invite_user_not_found`. The `DocInvite` table exists and is orphaned | Nothing but the work |
| **Invite management endpoints** — `PATCH`/`DELETE /docs/:id/invites/:inviteId` | §5.1, §Phase 1 Part 3 | Absent | Depends on pending invites |
| **Owner as an assignable role**, and with it any second owner | §Phase 1 Part 3 | Validator rejects `owner`. The §2.1 last-owner rule is real but reachable only for the sole creator | Product: is a second owner wanted before Phase 5? |
| **Ownership transfer** | §2.1 | No route. Invite-as-owner-then-demote is unavailable while owner is unassignable | Same decision |
| **Draft restore on the client** | §Phase 3 Part 1 | `GET /docs/:id/draft` works; nothing calls it. One deliberately failing test holds the gap open | Product: apply automatically, or offer a Restore control? |
| **`beforeunload` fallback** for the window before the first backup tick | §Phase 3 Part 1, techspec §4.1 | Nothing | Nothing but the work |
| **Share entry point in the editor top bar** (owner and editor) | §Phase 1 Part 3 entry-point table | Share is reachable from the dashboard row menu only | Nothing but the work |
| **`/help` page**, and the return of the "Need help?" link | §16.4 | Link removed, page never created | Content |
| **Version history**: retained update log, then a restore UI | §16.3 | Neither. Snapshot-per-save only | Phase 2 for the log; post-Phase-5 for the UI |

## 19. Design screen inventory

The PRD indexes designs by id; useful when a task says "build 2c". Recorded here so the mapping
survives independently of the `.dc.html` files.

| Ids | Area | Where in this doc |
|---|---|---|
| `1a`–`1d`, `6c`–`6d` | Dashboard, details drawer, empty state | Phase 1.1 |
| `2a`–`2g`, `6b`, `6e` | Editor and its sync states | Phase 1.2 |
| `3a`–`3b`, `5b`, `6f` | Sharing, roles, link access | Phase 1.3 |
| `4a`–`4e`, `6g` | Dictation | Phase 4.1 |
| `5a`–`5b`, `6h` | Viewer mode, View-only badge | Phase 1.2 |
| `6a`–`6h` | Responsive variants | §6.1 |
| `7a`, `7b`, `8e` | Sign-in (desktop / mobile / dark) | Phase 0.3 ✅ built |
| `8a`–`8e` | Theming | §6 |

The `.dc.html` files are **design references, not production code** — recreate them with the
codebase's own components and routing. `support.js` is runtime for the design files only and
**must not be ported**.

## 20. Assets

No bitmap images or external icon packs (see §18 conflict 5). Icons are inline SVG on a 24×24
grid. Avatars are initials on token-coloured fills. Fonts should be self-hosted in production.
The workspace-preview card on the sign-in screen is built from divs and should be replaced with a
real product screenshot when one exists.

## 21. Test environment

1. `docker compose up -d` from the repo root — Postgres on `:5432`, runs persistently.
2. `cd apps/server && pnpm dev` — API on `http://localhost:3000`.
3. `cd apps/web && pnpm dev` — app on `http://localhost:4000`.
4. **Dictation only:** `cd apps/stt && source venv/bin/activate && uvicorn main:app --port 8000`
   — first-time setup and model download in `apps/stt/README.md`. Without it the app works and
   dictation returns "Transcription is unavailable".
5. Sign in with a **real Google account** — auth is Google OAuth only; no test or mock login
   exists. First sign-in auto-creates the account.

**Unit and integration tests run from inside each app:**

```bash
pnpm exec vitest run --project server      # from the repo root; needs Postgres from step 1
pnpm exec vitest run --project web
```

Always name the project: a bare root `vitest run` with `-t` breaks name filtering across the two
projects — which is how a green suite was once reported as already-red. The STT service has no
test suite of its own; `apps/server/src/routes/stt.test.ts` covers the contract with the service
mocked.

**One test fails on purpose:** `apps/web/lib/api/presence.draft-restore.test.tsx`. It holds open
the unbuilt draft-restore gap (§18.2). A suite reporting `1 failed | 95 passed` on web is the
expected state, not a regression.

**E2E:** Playwright, with `e2e/setup/auth.setup.ts` producing one storage state per role and a
`seed:e2e` script for fixtures.

**Multi-account testing.** Sharing (Phase 1.3) needs **at least two real Google accounts** — one
owner, one invitee; a third covers the full role matrix. **Every invitee must have signed into
DocSync at least once**, or the invite is rejected (§Phase 1 Part 3) — the reverse of the advice
that applied when pending invites were thought to be merged. Keeping an account in reserve is now
pointless: an account that has never signed in cannot be invited at all.

Roles and documents can be set up through the product's own sharing flow, with **two exceptions
that still need the database** (Prisma Studio or `psql`), because no UI can produce them:

- **A second owner**, for the last-owner rule — `owner` is not an assignable role (§18.2).
- **A user with no display name**, for the "A collaborator" and "Unnamed collaborator" fallbacks.

For automated runs, `pnpm --filter server seed:e2e` creates one user per role, a shared document,
and a signed-in storage state for each — no Google round trip. `docs/qa-test-plan-hardening-fixes.md`
has the step-by-step for both.
