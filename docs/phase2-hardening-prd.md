# Phase 2 Hardening — Draft Restore, Shell-First Loading & Offline Fixes

**Status:** Ready for QA
**Branch:** `main` (the changes are staged in the working tree and not yet committed)
**Date:** 2026-09-21
**Basis ids:** AC-201 to AC-224 (a new range, so it cannot collide with the Phase 3 basis AC-101 to AC-141)
**Related:** master spec §Phase 2 Parts 1–3, §Phase 3 Part 1; `techspec.md` §4.1; `qa-summary.md` TS-19 / U-2

This document says what the current change set must do. It describes behaviour, not
implementation. When it conflicts with an older section of the master spec, the conflict is
recorded in §7 and not resolved silently.

---

## 1. Scope

| # | Area | What changed | Priority |
|---|---|---|---|
| 1 | Data loss | The user's own server-side draft backup is read back and **offered** for restore (closes U-2 / AC-116) | **P0** |
| 2 | Data loss | The heartbeat no longer overwrites the backup before it has been read | **P0** |
| 3 | Data loss | A newer server snapshot arriving at an open editor no longer marks unsaved edits as synced | **P0** |
| 4 | Offline | The API body limit matches the 5 MB queue item cap, so a queued save can never be refused forever | **P0** |
| 5 | Offline | Flushing a queued save now actually removes the stale cached `GET /docs/:id` | P1 |
| 6 | PWA | A worker already waiting when the page loads is activated right away, so the update banner stops coming back after every refresh | P1 |
| 7 | Loading | Protected routes paint the app shell straight away. Only the content area waits for the session | P2 |
| 8 | Regression | Normal save, offline queue, presence and update-banner behaviour is unchanged | P0 |

### Out of scope

- Restoring a backup automatically, with no user action. This is deliberately not done (see AC-205).
- Restoring **another user's** backup. Backups stay private to their author (techspec §4.1).
- Merging or diffing a backup against local edits in the UI. A restore is a plain CRDT merge.
- Any change to the draft endpoints themselves (`GET`/`POST /docs/:id/draft`).

---

## 2. Draft restore (items 1–2)

### Behaviour

When an editor or owner opens a document while online, the app reads that user's own draft
backup from the server **once**. If the backup holds writing that the document on this device
does not already contain, a notice appears under the top bar:

> **Unsaved draft found** — You have unsaved writing backed up from *<relative time>*.
> [Restore draft] [Not now]

- **Restore draft** merges the backup into the document as ordinary unsaved work. The badge
  reads **Draft** and the document is dirty, just as if the user had typed it. Nothing is saved
  and no one is notified until the user presses Save.
- **Not now** closes the notice. The backup is kept on the server until this device's next
  heartbeat replaces it.
- If the backup adds nothing new (the document already holds all of it), **no notice** appears.
- Viewers are never asked for a backup and never see the notice.
- Offline, no backup is requested and no notice appears.

### Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-201 | Opening a document as an owner or editor while online calls `GET /docs/:id/draft` exactly once per editor mount. It is not polled and not refetched on window focus | P0 |
| AC-202 | A viewer opening a document makes **no** `GET /docs/:id/draft` request and sees no restore notice | P1 |
| AC-203 | Opening a document offline makes no draft request and shows no restore notice | P1 |
| AC-204 | When local state is gone (IndexedDB cleared or a different device) and the backup holds content the document lacks, the notice appears with the title "Unsaved draft found", a relative timestamp taken from `backedUpAt`, and the "Restore draft" and "Not now" buttons | P0 |
| AC-205 | The backup's content does **not** appear in the document body until "Restore draft" is pressed | P0 |
| AC-206 | Pressing "Restore draft" puts the backup's content in the body, the notice closes, the badge reads **Draft**, and the dashboard row for the document shows it as having unsaved changes | P0 |
| AC-207 | A restored draft is not saved and triggers no push notification until the user presses Save. Pressing Save then persists it like any other edit | P0 |
| AC-208 | Pressing "Not now" closes the notice without changing the body or the badge | P1 |
| AC-209 | If the backup adds nothing beyond what the document already holds, no notice appears | P1 |
| AC-210 | Typing after the backup has been read does not make the notice appear or disappear. The restorable check runs once, when the backup arrives | P2 |
| AC-211 | **No heartbeat sends a draft backup until the backup read has settled** (with data, `null` or an error). Presence heartbeats still go out meanwhile | P0 |
| AC-212 | If the backup read fails (network or 5xx), the editor works normally, no notice appears, the request is not retried, and backups resume on the next heartbeat | P1 |
| AC-213 | A `null` backup (the user has none) shows no notice and does not block later backups | P1 |
| AC-214 | The notice's text comes from `DRAFT_RESTORE_LABELS` in `apps/web/constants/labels.ts`. It is exposed as `role="status"`, and both buttons can be reached by role and name | P2 |

### Worth probing directly

- **Backup arrives before IndexedDB has hydrated.** The restorable check compares the backup with
  the document *as it stands when the backup arrives*. If the local draft has not loaded from
  IndexedDB yet, a backup this device already holds may be offered anyway. A restore then merges
  the same content again, which is harmless as a CRDT merge, but the notice is noise. Decide
  whether this is acceptable (see §7, Q-2).
- **Access revoked between the read and the restore.** The restore itself is local, so the next
  heartbeat or save should take the existing access-revoked path.
- **Two tabs on the same document.** Each tab reads the backup and may offer it. Restoring in both
  tabs must not duplicate text.

---

## 3. Editor baseline stability (item 3)

### Behaviour

The editor's Yjs document is built once for each mount, from the snapshot the editor opened
with. If the document query later hands the open editor a newer `snapshot` (a refetch, a
`SAVE_FLUSHED` reconcile, or a collaborator's save), the editor must **not** tear down and
rebuild its local document. Newer server state reaches the editor only through
`reconcileWithServer`, which re-bases honestly: whatever the server now holds stops counting as
unsaved, and anything typed since still counts.

### Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-215 | With unsaved local edits, a refetch that returns a newer `snapshot` leaves the edits in the body and the badge on **Draft** | P0 |
| AC-216 | After that refetch, pressing Save sends the local edits. They were not treated as already synced | P0 |
| AC-217 | A brand-new document (`snapshot === null`) is still marked dirty on the dashboard from first paint | P1 |

---

## 4. Offline queue ↔ API limits (items 4–5)

### Behaviour

- **One cap, two places.** The web app accepts a queued save up to `QUEUE_ITEM_MAX_BYTES`
  (5 MB). The API's JSON body limit is now also 5 MB. A save the client accepts into the queue
  must be one the server will take. Otherwise a `413` looks like a transport failure and blocks
  that document's queue forever.
- **Stale cache really is dropped.** When the worker flushes a queued save, it deletes its cached
  `GET /docs/:id`, which is stale-while-revalidate and older than what it just sent. The API
  answers with `Vary: Origin`, so the delete has to ignore `Vary`. Without that, the entry never
  matched and the stale copy survived.

### Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-218 | `POST /docs/:id/save` with a JSON body between 1 MB and 5 MB is accepted. Over 5 MB it is refused with `413` | P0 |
| AC-219 | A queued save just under 5 MB flushes successfully on reconnect and the document's queue empties | P0 |
| AC-220 | After a queued save flushes, opening the same document offline shows the flushed content, not the content from before the save | P1 |

---

## 5. Service worker update on load (item 6)

### Behaviour

- If a new worker is **already waiting when a page loads**, the page tells it to activate right
  away. The update banner is **not** shown for it.
- If a new worker installs **while a page is open** (and the page is already controlled), the
  banner "Update available — refresh" appears as before. It activates only when the user presses
  Refresh, and the page reloads once the new worker controls it.
- A first install (no controller) shows no banner.

### Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-221 | Deploy a new worker, then reload: the banner does **not** appear, and after activation the page is controlled by the new worker. A second reload does not bring the banner back | P1 |
| AC-222 | With a document open and dirty, a new worker installing in the background shows the banner and does **not** reload or swap the page on its own | P0 |

---

## 6. Shell-first loading on protected routes (item 7)

### Behaviour

The app shell (sidenav and top bar) no longer waits for the session. On a refresh of any
protected route, the shell paints at once and only the content area shows the session states:

- *Checking your session…* spinner — fills the content area, not the viewport
- the "unreachable" error with Retry — fills the content area, not the viewport
- *Redirecting…* while an anonymous user is sent to login, keeping their return path

The full-page login route and OAuth callback still use the viewport-sized waiting state.

### Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-223 | While the session request is pending, the sidenav and top bar are visible and the spinner is shown only in the content area | P2 |
| AC-224 | An anonymous user on a protected route is still redirected to login with the original path and query preserved. The account badge shows no user details before the redirect | P0 |

### Regression (item 8)

Existing basis criteria stay green with no edits: the Phase 3 draft/presence basis (AC-101 to AC-141,
including AC-116 in `presence.draft-restore.test.tsx`), the editor save basis in
`.qa/archive/basis-doc-editor-save.md`, and `apps/server/src/routes/presence.test.ts`.

---

## 7. Conflicts and open questions

| ID | Question | Why it matters | Affects |
|---|---|---|---|
| Q-1 | **Conflict with master spec §Phase 2 Part 3:** "Do not call `skipWaiting()` automatically." The change now does this on page load when a worker is waiting. `sw.js` activates with `clients.claim()`, so **every other open tab** switches to the new worker, including one where someone is mid-edit. Is that acceptable, or should the auto-activate happen only when this is the only client? | A second tab with unsaved edits could have its code swapped with no warning, which is the exact case the rule exists for | AC-221, AC-222 |
| Q-2 | Should the restorable check wait for IndexedDB hydration before running? | Prevents a notice that restores nothing new | AC-209 |
| Q-3 | Stale comments. The `useServiceWorker` doc comment ("Never activates a waiting worker on its own") and the `SKIP_WAITING` handler comment in `sw.js` ("The only route to skipWaiting()") no longer describe the behaviour | Misleads future readers and reviewers; not a behavioural defect | — |
| Q-4 | The 5 MB limit is now duplicated in `app.ts` and `queue-schema.ts` with only a comment linking them. Should it move to `packages/shared` as a single constant? | Stops the two drifting apart, which is AC-218/219's failure mode | AC-218, AC-219 |

---

## 8. Test levels (guidance for the planner)

| Criteria | Suggested level | Notes |
|---|---|---|
| AC-201 to AC-214 | component (`apps/web`, jsdom + Testing Library) | Mock `@/lib/api/presence` as the existing TS-19 test does. Assert against `DRAFT_RESTORE_LABELS`, never literals |
| AC-211 | component | Hold `fetchOwnDraft` unresolved and assert `sendHeartbeat` is called without a backup payload |
| AC-215 to AC-217 | component / hook | Rerender with a new `snapshot` prop and assert `isDirty` and the body |
| AC-218 | integration (supertest, `apps/server`) | Needs docker compose Postgres |
| AC-219, AC-220 | e2e (Playwright) | Service worker + offline. Chromium only |
| AC-221, AC-222 | e2e | Needs two worker versions; bump `NEXT_PUBLIC_SW_VERSION` between loads |
| AC-223, AC-224 | component, plus one e2e for AC-224 | |

Run tests per project: `pnpm exec vitest run --project web` / `--project server`.
