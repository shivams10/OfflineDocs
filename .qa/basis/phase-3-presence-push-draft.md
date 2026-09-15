# Test Basis: Phase 3 — live presence, web push, draft backup, doc invite

- **Slug:** phase-3-presence-push-draft
- **Run:** 20260914-141157-3db533b-3x9v

- **Sources:**
  - `docs/techspec.md` §4 "Draft & save model" — change attribution wording for push copy
  - `docs/techspec.md` §4.1 "Draft autosave (server-side backup)" — heartbeat cadence, privacy, non-merge, non-notify, restore intent
  - `docs/techspec.md` §6 "Push notifications" — subscription, 5s debounce, recipient targeting, payload, SW suppression, tap behaviour
  - `docs/techspec.md` §7 "Presence indicator" — TTL, poll cadence, chips, scope limits
  - `docs/techspec.md` §8 "Collaborator permissions & roles" — role enforcement on save/fetch, and the "≥ Viewer to be pushed to / shown as present" rule
  - `docs/techspec.md` §9 "Offline & conflict handling — edge cases" — revoked-access heartbeat, push permission denied
  - `docs/techspec.md` §10 "Security & auth notes" — CSRF header on every state-changing method, server-side role checks
  - `docs/techspec.md` §16 "Reconciliation with the PRD" — conflicts #1 (push not in the PRD), #3 ("live" presence), #8 (draft endpoint unspecified)
  - `docs/userflow-diagram.md` §4 "Save & push notifications" — the save → merge → push → SW → tap flow
  - `docs/docsync-master-spec.md` §1.3 (lines 667–763) + endpoint table (lines 747–752) — the pending-invite flow the `DocInvite` table exists for
  - `apps/server/prisma/schema.prisma` + `migrations/20260914074212_add_doc_invite`, `migrations/20260914112539_add_draft_backup_and_presence` — contract: keys, uniqueness, cascade rules
  - `apps/server/src/validators/presence.ts`, `validators/push.ts` — contract: request body shapes
  - `packages/shared/src/types.ts` — contract: `PresenceUser`, `PresenceResponse`, `DraftBackupRequest/Response`, `DraftResponse`, `PushSubscriptionRequest`, `VapidKeyResponse`
  - Existing tests (convention only, never oracle): `apps/server/src/routes/presence.test.ts`, `services/presence.test.ts`, `services/push.debounce.test.ts`, `services/docs.save.test.ts`, `apps/web/components/documents/presence-chips.test.tsx`, `apps/web/lib/documents/use-draft-backup.test.tsx`

- **ID numbering:** criteria start at **AC-101**, not AC-1. Tests already in the tree carry
  `[AC-31] [AC-49] [AC-50]` from the retired `doc-editor-save` basis (now under `.qa/archive/`).
  Restarting at 1 would have made those annotations ambiguous across two live documents.

- **Scope:** the phase-3.0 working tree — presence lifecycle and TTL, the draft-backup heartbeat
  (privacy, non-merge, non-notify, restore), web-push subscription/debounce/targeting/payload and
  the service-worker receive side, CSRF and session gating on the endpoints this change adds, and
  the `DocInvite` table this change migrates in.

- **Out of scope:** Yjs merge semantics already covered by the retired `doc-editor-save` basis; STT
  (§5, not built); offline Background Sync (§9, phase 2); auth/OAuth internals (§10, phase 0);
  visual design of the chips, toggle and topbar.

## Acceptance criteria

| ID | Given / When / Then | Source | Confidence |
|---|---|---|---|
| AC-101 | Given a collaborator with the doc open, when the client POSTs its periodic heartbeat, then that user is marked present on that doc | techspec §7 "the same periodic POST while a doc is open also marks that user as present on that doc" | stated |
| AC-102 | Given a presence row last refreshed within the TTL, when the who's-here endpoint is read, then that user is listed; given a row older than the TTL, then they are not | techspec §7 "TTL of roughly 60s (~2x the heartbeat interval)" | stated |
| AC-103 | Given a user whose tab was closed or connection dropped with no "leaving" call, when the TTL elapses, then their entry expires on its own | techspec §7 "if heartbeats stop — tab closed, browser crashed, network dropped — the entry expires on its own. No explicit 'leaving' signal is needed" | stated |
| AC-104 | Given a user whose access to the doc has been revoked, when who's-here is read, then they are not listed even if their row is still fresh | techspec §8 "Push notifications (Section 6) and presence (Section 7) are only sent to/shown for users who currently have at least Viewer access" | stated |
| AC-105 | Given a user with no role on the doc, when they call any presence or draft route, then the request is refused as not-found/forbidden rather than served | techspec §8 "Role checks … run server-side on every Save / fetch / collaborator call"; §9 "Backend returns 403/404" | derived |
| AC-106 | Given a doc is open, when 15–20s elapse, then the client polls the who's-here endpoint again | techspec §7 "Client polls a cheap 'who's here' endpoint every ~15–20s while a doc is open" | stated |
| AC-107 | Given a doc is open, when 20–30s elapse, then the client POSTs its current draft again | techspec §4.1 "the client periodically (every ~20–30s) POSTs its current Draft" | stated |
| AC-108 | Given the configured heartbeat interval and presence TTL, then the TTL is roughly twice the heartbeat interval, and the poll interval is shorter than the TTL | techspec §7 "TTL of roughly 60s (~2x the heartbeat interval)" | derived |
| AC-109 | Given other collaborators are present, when the editor renders, then presence chips appear in the editor header naming them, and the signed-in user is not shown as one of the "others" | techspec §7 "renders small presence chips (e.g. avatar/initials) in the editor header — 'Priya has this doc open'" | stated (self-exclusion: derived from "who *else* has this doc open") |
| AC-110 | Given presence is read, then the response carries only who is present (identity and role), never cursor position, typing state or document text | techspec §7 "Scope is intentionally limited to open/not-open. No cursor position, no typing indicator, no live text" | stated |
| AC-111 | Given the client backs a draft up, when the request is sent, then it goes to a separate draft endpoint and not to the Save endpoint | techspec §4.1 "POSTs its current Draft to a separate `draft` endpoint — **not** the Save endpoint" | stated |
| AC-112 | Given two users have the same doc open, when each backs up, then each backup is stored against its own `(docId, userId)` key and neither overwrites the other | techspec §4.1 "a private backup keyed to `(docId, userId)`"; schema `DocDraft @@id([docId, userId])` | stated |
| AC-113 | Given a draft backup is stored, then the canonical document snapshot is unchanged by it | techspec §4.1 "does **not** merge into the canonical doc" | stated |
| AC-114 | Given a draft backup is stored, then no push notification is queued or sent to anyone | techspec §4.1 "does **not** trigger a push notification" | stated |
| AC-115 | Given user A has a draft backup on a doc, when user B (any role, including owner) reads the draft endpoint for that doc, then B receives B's own backup or none — never A's | techspec §4.1 "is only ever readable by that same user" | stated |
| AC-116 | Given a user backed a draft up and then returns with no local copy (storage cleared, or a different device), when they open the doc, then their backed-up draft is available to resume | techspec §4.1 "is only ever readable by that same user to resume their own draft"; "doesn't help if storage is cleared or the user never comes back on that device" | stated |
| AC-117 | Given the doc was deleted or the user's access revoked, when their next heartbeat lands, then the backend returns 403/404 and the client surfaces a "you no longer have access" state rather than failing silently | techspec §9 "Backend returns 403/404; client surfaces a 'you no longer have access' state instead of silently failing" | stated |
| AC-118 | Given the caller's role is viewer, when they heartbeat, then they are recorded as present but no draft of theirs is stored | techspec §7 (presence is open/not-open, role-agnostic) + §8 "Viewer (read-only)" | derived |
| AC-119 | Given the user closes the tab before the first backup tick has fired, then a lightweight `beforeunload` confirmation warns them; after the first tick it is unnecessary | techspec §4.1 "keep a lightweight one only as a fallback for the narrow window before the *first* backup tick" | stated |
| AC-120 | Given a user opts in, when the client subscribes, then it calls `pushManager.subscribe()` with the VAPID public key and the resulting subscription object is stored server-side against that user | techspec §6 "client calls `pushManager.subscribe()` with VAPID public key, sends subscription object to backend, stored per-user" | stated |
| AC-121 | Given a Save request is merged, when the merge is durable, then a Web Push is triggered to the document's other subscribed collaborators | techspec §6 "the backend sends Web Push to a document's other subscribed collaborators as soon as a Save request is merged"; userflow §4 K→M | stated |
| AC-122 | Given a save has been merged, when a further save for the same doc lands within 5 seconds, then the timer restarts and exactly one notification fires once the burst goes quiet | techspec §6 "A short **5-second** debounce is still applied per-document (restart the timer on each new Save, then fire once it goes quiet)" | stated |
| AC-123 | Given saves land on two different documents inside one debounce window, then each document notifies independently | techspec §6 "applied per-document" | derived |
| AC-124 | Given a doc is saved, when the notification fires, then it is sent to every subscribed collaborator **except** the saving editor | techspec §6 "push is sent to every subscribed collaborator except the saving editor" | stated |
| AC-125 | Given a subscribed user has no role on the doc at send time — never had one, or lost it during the debounce window — then they receive nothing | techspec §8 "only sent to … users who **currently** have at least Viewer access" | stated |
| AC-126 | Given a notification is sent, then its payload carries exactly `{ docId, docTitle, editorName, changeSummary }` and nothing more | techspec §6 "Payload: `{ docId, docTitle, editorName, changeSummary }` — kept small (push payloads are size-limited)" | stated |
| AC-127 | Given the push arrives and that document is already open and focused in one of the recipient's own tabs, then the OS notification is suppressed and an in-app toast/badge update is shown instead | techspec §6 "the receiving client's service worker checks `clients.matchAll()` … and suppresses the OS notification (showing an in-app toast/badge update instead) if that document is already open and focused"; userflow §4 O→P | stated |
| AC-128 | Given the push arrives and the document is not open and focused, then an OS notification is shown naming the editor and what they changed | userflow §4 S "Show OS notification: 'X saved doc — N changes'" | stated |
| AC-129 | Given an OS notification for a doc, when the user taps it, then an existing tab showing that doc is focused, or the app is opened/navigated to that doc — not a duplicate tab | techspec §6 "primary tap deep-links to the document"; userflow §4 U "focus/open client, deep-link to doc" | stated (no-duplicate-tab: derived) |
| AC-130 | Given notification permission is denied, then in-app toasts/badges still work while the app is open and no OS notification is attempted | techspec §9 "Push permission denied → In-app toasts/badges still work when app is open; no OS-level notification" | stated |
| AC-131 | Given a save that added N lines, then the change summary reads as human copy describing that change (e.g. "added 3 lines"), with grammatical number matching N | techspec §4 'Change attribution for push copy (e.g. "Priya added 3 lines")' | stated (singular/plural: derived) |
| AC-132 | Given a browser endpoint already registered to user A, when user B signs in on that same browser profile and subscribes, then the endpoint moves to B — it is not duplicated, and A stops receiving on it | schema `PushSubscription.endpoint @unique` + techspec §6 "stored per-user" | derived |
| AC-133 | Given user A knows user B's push endpoint string, when A calls unsubscribe with it, then B's subscription survives | techspec §10 "Role checks … run server-side"; §8 enforcement principle | derived |
| AC-134 | Given any state-changing endpoint added by this change (`POST /docs/:id/draft`, `POST /push/subscribe`, `DELETE /push/subscribe`), when it is called without the `X-CSRF-Token` header matching the `docsync_csrf` cookie, then it is rejected | techspec §10 "a readable `docsync_csrf` cookie must be echoed in an `X-CSRF-Token` header on every state-changing method. The guard is mounted globally, before the routes, so a new endpoint cannot ship without it" | stated |
| AC-135 | Given no session cookie, when any presence, draft or push endpoint is called, then it is rejected with 401 | techspec §10 "Both tokens are httpOnly cookies"; role checks server-side on every call | derived |
| AC-136 | Given an owner invites an email with no DocSync account, then a pending invite is recorded and `201 { status: "pending", invite }` is returned — not a rejection | master spec §1.3 "Inviting an email with no DocSync account records the invite rather than rejecting it"; endpoint table line 748 | stated — **NOT IMPLEMENTED on this branch** |
| AC-137 | Given a pending invite exists for an email, when that person signs in (first time or any later time), then the invite becomes a collaborator row and the invite is deleted | master spec §1.3 "Claiming happens on every sign-in, not only account creation"; line 267 "claiming deletes the invite and inserts the collaborator row" | stated — **NOT IMPLEMENTED** |
| AC-138 | Given a pending invite, when a non-owner calls `PATCH`/`DELETE /docs/:id/invites/:inviteId`, then it is refused; an owner may change its role or revoke it | master spec endpoint table lines 751–752 "owner"; §1.3 "An owner can change a pending invite's role, or revoke it" | stated — **NOT IMPLEMENTED** |
| AC-139 | Given `GET /docs/:id/collaborators`, then `invites` is always `[]` for non-owners | master spec line 747 | stated — **NOT IMPLEMENTED** |
| AC-140 | Given an email already invited and unclaimed, when it is invited again to the same doc, then the call errors and no second pending row is created; emails are stored lowercased and trimmed | master spec §1.3 "An email already invited, unclaimed → Error saying it's already invited. No second pending row"; schema `@@unique([docId, email])` | stated — **NOT IMPLEMENTED** |
| AC-141 | Given a doc is deleted, then its draft backups, presence rows and invites are deleted with it | schema `onDelete: Cascade` on `DocDraft`, `DocPresence`, `DocInvite`; master spec line 546 "cascades `DocCollaborator` and `DocInvite`" | stated |

## Data and boundaries

| Field / input | Type | Valid range | Invalid examples | Source |
|---|---|---|---|---|
| `DraftBackupRequest.update` | base64 string, optional | non-empty when present; omitted by viewers | `""` (min 1 violated); non-base64 accepted at this layer by design | `validators/presence.ts`; `packages/shared/src/types.ts` |
| `PushSubscriptionRequest.endpoint` | URL string | a valid absolute URL; unique across all users | `"not-a-url"`; a duplicate belonging to another user (must move, not collide) | `validators/push.ts`; schema `@unique` |
| `PushSubscriptionRequest.keys.p256dh` / `.auth` | string | non-empty | `""`; missing key object | `validators/push.ts` |
| Presence TTL | seconds | ~60 (≈2× heartbeat) | a TTL below the heartbeat interval blinks live users out | techspec §7 |
| Heartbeat interval | seconds | 20–30 | <20 (chatty), >30 (TTL gaps) | techspec §4.1 |
| Who's-here poll interval | seconds | 15–20 | ≥ TTL (a peer would vanish between polls) | techspec §7 |
| Push debounce window | ms | 5000 | 0 (a buzz per keystroke-save); minutes (stops feeling immediate) | techspec §6 |
| `changeSummary` line delta | integer | any; N=1 singular, N≠1 plural, N=0 → no line change | "added 1 lines" | techspec §4 |
| `DocInvite.email` | string | lowercased, trimmed; unique per doc | `"  Ada@Example.com "` stored as-is | master spec line 268; schema |

## Roles and permissions

| Role | May | May not | Source |
|---|---|---|---|
| Owner | Everything an editor may; invite/remove collaborators, change roles, see and manage pending invites | — | techspec §8; master spec endpoint table |
| Editor | Edit and Save; heartbeat (present); store and read back their own draft backup; receive push for the doc | Change sharing; read another user's draft backup | techspec §8; §4.1 |
| Viewer | Read the doc; be present; receive push for the doc | Save; have a draft backup stored | techspec §8 "The Save endpoint … rejects the merge if the requesting user's role is `viewer`"; §8 push/presence "at least Viewer access" |
| No role | Nothing | Read presence, heartbeat, read a draft, or receive push for that doc | techspec §8, §9 |
| Any signed-in user | Manage **their own** push subscription | Remove another user's subscription | AC-133 (derived) |

## States

Editor surface:
- **default** — chips for other present collaborators, sync badge, Save (techspec §7, §4) — specified
- **empty (nobody else present)** — no chips (derived from "who *else*"; the chips component already treats it so) — derived
- **loading (presence not yet fetched)** — UNKNOWN: no source specifies whether chips show a skeleton or nothing
- **partial** — UNKNOWN: no source covers presence resolving while the doc body is still loading
- **error (presence poll fails)** — UNKNOWN: no source says whether a failed poll clears the chips, keeps the last list, or surfaces an error
- **offline** — editing stays fully enabled, warning badge (techspec §4 state table) — specified; heartbeat cannot land, and a failed beat must not be read as revoked access (derived from §9, which scopes the revoked state to a 403/404)
- **unauthorised (access revoked mid-session)** — "you no longer have access" state (techspec §9) — specified. Whether the unsaved local draft is preserved or discarded in that state is **UNKNOWN** (see below)
- **success** — "Saved / Synced" badge (techspec §4) — specified

Push opt-in surface:
- **default / granted / denied** — denied is specified (techspec §9: in-app only, no OS notification)
- **unsupported browser** — UNKNOWN: no source specifies what the toggle shows where the Push API is absent
- **server has no VAPID keys** — UNKNOWN: no source specifies this state at all

Notification (recipient device):
- **doc open + focused** → in-app toast/badge, no OS notification (techspec §6) — specified
- **doc not open** → OS notification (userflow §4 S) — specified
- **permission denied** → badge/unread count only (userflow §4 R) — specified

## Contracts touched

| Surface | Constraint it imposes |
|---|---|
| `POST /docs/:id/draft` | Session + ≥viewer required; body `{ update?: string }`; state-changing → CSRF header required; returns `{ backedUpAt: string \| null }` |
| `GET /docs/:id/draft` | Session + ≥viewer; returns `{ draft: { update, backedUpAt } \| null }` scoped to the caller only |
| `GET /docs/:id/presence` | Session + ≥viewer; returns `{ present: PresenceUser[] }` including the caller; `PresenceUser` = `{ userId, name, avatarUrl, role }` — no cursor/typing fields |
| `GET /push/vapid-public-key` | Session; returns `{ publicKey: string \| null }` |
| `POST /push/subscribe` | Session; body `{ endpoint: url, keys: { p256dh, auth } }`; CSRF required; `204` |
| `DELETE /push/subscribe` | Session; body `{ endpoint: url }`; CSRF required; `204`; scoped to the caller's own rows |
| `POST /docs/:id/save` (changed) | Now additionally clears the caller's draft backup and queues a notification |
| `DocDraft` | PK `(docId, userId)`; `update Bytes`; cascade on doc and user delete |
| `DocPresence` | PK `(docId, userId)`; `lastSeenAt` auto-updated; index `(docId, lastSeenAt)`; cascade |
| `DocInvite` | PK `id`; `@@unique(docId, email)`; index on `email`; cascade on doc and inviter delete |
| `PushSubscription` | `endpoint @unique` **globally**, not per user — one endpoint, one owner |
| Web-push payload | `{ docId, docTitle, editorName, changeSummary }`, size-limited |
| SW message channel | `postMessage({ type: "docsync:doc-saved", payload })` from `sw-push.js` to the focused page |

## Non-functional criteria

- Push payloads "kept small (push payloads are size-limited)" — techspec §6. No byte budget is stated.
- Heartbeat doubles as presence "so it doesn't add extra chattiness" — techspec §4.1. A chattiness budget is implied, not quantified.
- Presence storage: "in-memory map or a Postgres table with a `last_seen` column is fine at MVP scale — no Redis needed" — techspec §7. No latency or scale target stated.
- Status "must be conveyed by label and icon, not colour alone" — techspec §4 / PRD §10. Applies to the presence and revoked-access surfaces this change adds.
- No performance budget, browser matrix, i18n or retention rule is stated for any surface in this change.

## Observed, not specified

- **Saving clears the saver's own draft backup** (`controllers/docs.ts` calls `clearOwnDraft` after `saveDoc`). No source says what happens to the backup once the content is canonical. Question: is discarding it correct, or should the backup survive as a pre-save copy?
- **`changeSummary` is derived from a line-count delta** on the merged text. techspec §4 says attribution "is derived from the client-id embedded in the Yjs update sent at Save time" — a different mechanism. Question: is the line-delta wording an acceptable substitute, and is `editorName` allowed to fall back to the saver's email address when they have no name?
- **Push is a no-op when VAPID keys are absent** (`isPushConfigured()` guards every entry point; `vapid-public-key` returns `null`). No source specifies an unconfigured-server behaviour. Question: is silent degradation right for production, or should a configured-for-push environment fail loudly?
- **Presence rows are swept opportunistically after 1 hour** (`PRESENCE_SWEEP_AFTER_SECONDS`). No source mentions sweeping at all. Question: is unbounded `DocPresence` growth between sweeps acceptable?
- **Viewers are refused a draft *body*, but still counted present.** techspec never states the refusal explicitly. Question: confirm a viewer's local scratch text is genuinely not worth backing up.
- **A revoked-access banner keeps the local text and offers it for copying** (`doc-editor.tsx`). techspec §9 requires the *state* but says nothing about the draft's fate. Question: is preserving and offering the text the intended behaviour? (Treated as `derived` for AC-117's scenario because discarding a user's unsaved work on someone else's action would contradict the offline-first premise — but it needs confirming.)
- **`DocInvite` is migrated but orphaned.** The schema comment says so outright, and `services/collaborators.ts` (unchanged on this branch) still rejects unknown emails with `invite_user_not_found` — the very behaviour master spec line 737 records as **rejected**. Question: is the table landing ahead of the code deliberate sequencing, or did the feature get dropped?
- **The draft *restore* path has no caller.** `apps/web/lib/api/presence.ts` exports `fetchDraft()`; nothing in the web app calls it, and `use-yjs-doc.ts` seeds only from the server snapshot. AC-116 — the stated reason §4.1 exists — is therefore unimplemented. Question: was restore deferred, and if so, what does a returning user see?

## UNKNOWN — needs a human decision

| # | Question | Why it blocks testing | Cheapest way to resolve |
|---|---|---|---|
| U-1 | techspec §16 conflict #1 says "**Do not build Phase 3 until answered**" — push is absent from the PRD entirely. Was that answered? | The whole push half of this change (AC-120…AC-132) may be unsanctioned scope. Testing it hardens something that might be reverted | One line from the product owner in the ticket or §16 |
| U-2 | Is the draft **restore** (AC-116) in scope for this branch, or deferred? | Decides whether a restore test is a legitimate red (a real gap) or a scenario for a later branch | Ask the implementer; 1 minute |
| U-3 | Is `DocInvite` (AC-136…AC-140) meant to be implemented here, or is the migration landing ahead of the code? | Five criteria have no implementation. Tests would be five reds that nobody asked for | Ask the implementer; 1 minute |
| U-4 | When access is revoked mid-session, is the unsaved local draft preserved (current behaviour) or discarded? | AC-117's assertion changes entirely. Getting it backwards means either asserting data loss, or asserting a stale copy of a revoked doc lingers | Product decision; affects one component |
| U-5 | What should the presence chips show while the first poll is in flight, and when a poll errors? | Two states with no oracle. A test would have to invent one | Figma frame, or a one-line product call |
| U-6 | Should the draft backup survive a successful save, or be cleared (current behaviour)? | Decides whether the observed `clearOwnDraft` call is correct or a bug | Product decision |
| U-7 | Is a line-count delta acceptable copy for `changeSummary` where §4 specifies client-id attribution? | AC-131's assertion depends on which mechanism is intended | Implementer + product; 5 minutes |
| U-8 | Is the `beforeunload` fallback of AC-119 implemented, and what exactly should it say? | No copy is specified and the behaviour was not located in the change | Grep + one product call |
| U-9 | techspec §16 conflict #3: the PRD says "live presence", this spec says a ~20s poll. Read as "current" for now — confirmed? | If "live" wins, the poll cadence criteria (AC-106/107/108) are wrong rather than merely approximate | Product owner, one line |

**Blocking assessment:** 41 criteria, 9 UNKNOWNs. The UNKNOWNs block **AC-116 and AC-136…AC-140 outright (6 criteria, 15%)**, and cast doubt over the push half's mandate (U-1) without changing what it should do. Below the one-third threshold — planning on this basis is sound, provided the invite criteria are not planned as if implemented.

## Assumptions taken

- **The push feature is in scope despite U-1.** It is built, wired into the save path and migrated. Blast radius if wrong: up to 10 planned scenarios cover code that gets reverted — wasted effort, no false confidence.
- **"≥ Viewer access, currently" is evaluated at send time, not save time** (AC-125). Reading §8's "currently" any other way would notify someone whose access was removed seconds earlier. Blast radius if wrong: one scenario asserts a stricter rule than intended — a false red, not a missed bug.
- **AC-117 preserves the unsaved draft** pending U-4. Blast radius if wrong: one component scenario asserts the opposite of intent; caught in review, not in production.
- **The invite criteria (AC-136…AC-140) are recorded but not planned as testable behaviour on this branch**, pending U-3. Blast radius if wrong: an implemented feature ships untested — mitigated by naming it explicitly in the plan's "Not testing, deliberately".
