# QA Summary — DocSync

What has been tested so far with qa-kit, what came out of it, and what is still open.
Every number here comes from files under `.qa/`. None of them are estimates.

| Run | Date | Branch | Change | Verdict |
|---|---|---|---|---|
| 1 | 2026-09-14 (05:53–06:41) | `feature/edit-docs` | Doc editor: explicit Save, offline drafts, viewer lock | **not-ready** |
| 2 | 2026-09-14 (14:11–14:34) | `phase-3.0` | Live presence, web push, draft backup, doc invite | not recorded (run never closed) |
| 3 | 2026-09-15 | `phase-4.0` | Hardening fixes (email visibility, last-owner lock, save lock, mobile push row) | **not started**: stopped at planning |

---

## Run 1 — Doc editor save

**Session:** `20260914-055319-e25aa1d-u42r` · **Cost:** 18.0M tokens · 48 min · 6 agents

**Basis:** 58 acceptance criteria (`.qa/archive/basis-doc-editor-save.md`)
**Plan:** 20 scenarios: 5 unit · 3 integration · 1 authz · 9 component · 2 e2e (`.qa/archive/plan-doc-editor-save.md`)

### Decisions taken by the developer

| Question | Answer |
|---|---|
| New document title: empty placeholder or literal "Untitled document"? | Literal "Untitled document". The server's value is shown |
| Badge after typing, following a failed save (PRD 5.3 vs 5.4 contradict)? | Returns to Draft. Typing clears Save failed |
| Offline plus a prior failed save: which badge wins? | Save failed wins over Offline |
| May an Editor rename a document? | Yes, owner and editor both. **The owner-only `PATCH /docs/:id` is a product bug** |
| Title rename failure: revert silently or surface it? | Out of scope. Scenario dropped, residual risk recorded |
| IndexedDB in jsdom? | `fake-indexeddb` added as a devDependency in `apps/web` |
| Go-ahead to write tests? | Approved, test files only, source untouched |

### Outcome

- The run ended with the verdict **not-ready** and went through triage.
- Known product bug: editors cannot rename, because `PATCH /docs/:id` is owner-only (decision 4).
- Gaps noted by the implement agents:
  - The save-failure banner in `doc-editor.tsx` has no `role="alert"`. No criterion requires one, so no test asserts it.
  - `docs.save.test.ts` covers AC-51/52/56 with a single `it()` looped over 6 cases. That is a thin spot, and not enough as the only coverage for save.

---

## Run 2 — Phase 3: presence, push, draft backup

**Session:** `20260914-141157-3db533b-3x9v` · **Cost:** 19.6M tokens · ~23 min
**Stages completed:** plan → implement → run. `run.finished` was never recorded.

**Basis:** 41 acceptance criteria, AC-101 to AC-141 (`.qa/basis/phase-3-presence-push-draft.md`)
**Plan:** 20 scenarios: 9 integration · 2 authz · 5 unit · 4 component
**Priority:** 4 P0 · 9 P1 · 5 P2 · 2 P3 (`.qa/plans/phase-3-presence-push-draft.md`)
**Implemented in 5 waves** (`.qa/briefs/phase-3-presence-push-draft-w01…w05.md`)

### Scenarios

| Id | Pri | Level | AC | Scenario |
|---|---|---|---|---|
| TS-1 | P0 | integration | AC-134 | Draft heartbeat refuses a request with no CSRF token |
| TS-2 | P0 | integration | AC-134 | Push subscribe/unsubscribe refuse a request with no CSRF token |
| TS-3 | P0 | authz | AC-135 | Every push route refuses an anonymous caller |
| TS-4 | P1 | authz | AC-133 | Knowing an endpoint string doesn't let you unsubscribe someone else |
| TS-5 | P1 | integration | AC-132 | A shared browser's endpoint moves to whoever signed in last |
| TS-6 | P2 | integration | AC-121 | Saving a document queues a notification |
| TS-7 | P1 | integration | AC-114 | Backing a draft up notifies nobody |
| TS-8 | P1 | integration | AC-125 | A subscriber with no role on the doc receives nothing |
| TS-9 | P1 | integration | AC-125 | Access removed during the debounce window removes the recipient |
| TS-10 | P2 | integration | AC-126 | Notification payload carries exactly the four specified fields |
| TS-11 | P3 | unit | AC-131 | Change summary agrees in number with what changed |
| TS-12 | P0 | integration | AC-141 | Deleting a doc removes its drafts and presence rows |
| TS-13 | P1 | unit | AC-127 | Worker stays silent for a doc you're already looking at |
| TS-14 | P2 | unit | AC-128 | Unfocused recipient gets an OS notification naming editor and change |
| TS-15 | P1 | unit | AC-129 | Tapping a notification focuses the tab that already has the doc |
| TS-16 | P2 | component | AC-127 | In-app notice appears when the worker hands a save to the page |
| TS-17 | P1 | component | AC-117 | Losing access is surfaced, and unsaved text survives it |
| TS-18 | P3 | component | AC-109 | You aren't listed as someone else viewing your own doc |
| TS-19 | P1 | component | AC-116 | An author is offered their own backup when local state is gone |
| TS-20 | P2 | unit | AC-108 | Cadences honour TTL ≈ 2× heartbeat |

### Test run results

| Project | Test files | Tests | Passed | Failed |
|---|---|---|---|---|
| server | 10 | 32 | 32 | 0 |
| web | 11 | 53 | 53 | 0 |

### Proof that the tests can fail (mutation check)

Each new test was re-run against a deliberately broken version of the code it guards.

| Wave | Proven | Unproven |
|---|---|---|
| w01 (push subscription / targeting) | 4 | 0 |
| w02 (push payload, service worker) | 8 | 0 |
| w03 (push routes, change summary, cascade) | 3 | **1** |
| w04 (presence routes, docs push, editor) | 7 | **1** |
| w05 (saved notice, presence push, env) | 8 | 0 |

w05 first came back `red-already` on all 8 tests. The cause was the tooling, not the tests: vitest
had been run from the root across both projects. Re-running per project
(`--project server` / `--project web`) proved all 8.

**Unproven. These tests pass but guard nothing yet:**

1. `apps/server/src/services/docs.cascade.test.ts`, "leaves zero DocDraft and DocPresence rows for
   the doc once it is deleted". It stayed green with `schema.prisma` mutated. The agent was not
   allowed to modify `prisma/schema.prisma` or its migrations, so the cascade mutation could never
   actually be applied.
2. `apps/web/components/documents/doc-editor.presence.test.tsx`, "renders no chips at all when the
   only person present is the caller". It stayed green with `doc-editor.tsx` mutated, so it does
   not test what its name claims.

### Source changes made during QA

- `apps/server/src/services/docs.ts`: `describeChange` was exported so TS-11 could unit-test it.
  No other source was touched.

### Observations from the implement agents

- **Fake timers don't work against the real database.** `vi.useFakeTimers()` does not reliably wait
  out real Postgres I/O in debounce tests. Instead, mock `PUSH_DEBOUNCE_MS` down to a short real value
  (150ms) and use real timers with `vi.waitFor`.
- **`editorName` fell back to the saver's email** (`?? email` in `controllers/docs.ts`). An empty-string
  name would also slip past `??`. Run 3's staged change replaces the email fallback with "A collaborator".
- **`describeChange` returns "edited this document" for any edit that doesn't change the line count**,
  including a genuine no-op.
- **AC-131 is disputed.** The techspec says to attribute changes by Yjs client-id, but the code uses
  a line-count delta. TS-11 asserts only the grammar.

### Deliberately not tested

| Area | Why | Residual risk |
|---|---|---|
| Doc invite (AC-136…140) | `DocInvite` table is migrated but orphaned. Nothing reads or writes it | Inviting an email with no account is still rejected |
| Real push delivery | Needs VAPID keys, a live push service, two browser profiles | Transport / VAPID signing breaks are caught only manually |
| `beforeunload` fallback (AC-119) | Not found in the change | Typing then closing within ~25s loses work silently |
| Push off without VAPID keys | Not specified anywhere | A deploy missing VAPID vars sends nothing, and nothing alerts |
| `clearOwnDraft` on save | Not specified (basis U-6) | Saving then typing leaves no server-side backup |
| Presence loading / poll-error states | No spec (U-5) | A failed poll may clear or freeze chips |
| Presence sweep | Housekeeping detail | `DocPresence` grows between sweeps |
| `push-toggle.tsx`, `app-topbar.tsx`, labels, routes | Presentation only | A wiring mistake leaves push un-subscribable |
| `lib/push/subscribe.ts`, `use-push.ts` | Thin browser-API wrappers, so a test would only assert the mock | Permission-denied / unsupported paths unproven |
| Zod validators for push / presence | Library behaviour | A widened schema would not be caught |

### Open questions (blocking UNKNOWNs)

| Basis | Question | Blocks |
|---|---|---|
| U-1 | Was techspec §16 conflict #1 ("do not build Phase 3 until answered") ever answered? | Mandate for ~10 push scenarios |
| U-2 | Is draft restore in scope on this branch? | TS-19 |
| U-3 | Is `DocInvite` meant to be implemented here? | AC-136…140 |
| U-4 | On revoked access, keep or discard the unsaved draft? | TS-17 (written assuming keep) |
| U-7 | Is a line-count delta acceptable for `changeSummary`? | TS-11 |

### Manual checks still to do

1. **Real push round trip:** A saves, and B's device shows an OS notification within ~5s naming A.
2. **Suppression:** B focused on the same doc sees the in-app notice and no OS notification.
3. **Tap-through:** tapping the notification focuses the existing tab rather than opening a new one.
4. **Permission denied:** no OS notification appears, but the in-app notice still works (AC-130).
5. **Colour independence:** presence chips and the revoked banner still read correctly in greyscale.
6. **Unconfigured server:** with VAPID vars unset, saves still work and the push toggle hides.

---

## Run 3 — Phase 4 hardening fixes (in progress)

**Session:** `20260915-071918-89c305a-n6q3` · **Status:** stopped during planning. No basis or plan written yet.

### What the staged change contains

| Area | File | Change |
|---|---|---|
| Email privacy | `apps/server/src/controllers/collaborators.ts`, `packages/shared/src/types.ts` | `GET /docs/:id/collaborators` returns `email` only to owners (`null` otherwise). Invite and change-role still return it |
| Push copy | `apps/server/src/controllers/docs.ts` | `editorName` falls back to "A collaborator", never the email |
| Last-owner rule | `apps/server/src/services/collaborators.ts` | `assertLeavesAnOwner` locks owner rows `FOR UPDATE`, so two concurrent demotes/removals can't leave zero owners |
| Lost save | `apps/server/src/services/docs.ts` | `saveDoc` reads, merges and writes inside a transaction with `SELECT … FOR UPDATE` |
| Share panel | `apps/web/components/documents/collaborator-list.tsx` | Display name = name → email → "Unnamed collaborator". Email line hidden when null |
| Mobile push | `push-toggle.tsx`, `mobile-nav-push-row.tsx`, `app-sidenav.tsx` | Toggle split into `canShowPushToggle` / `PushToggleButton`. New Notifications row in the mobile drawer |
| Copy | `login/page.tsx`, `constants/labels.ts` | "Need help?" removed. "Version history" pitch replaced with "Roles & sharing" |

### Tests already written for it (by the developer)

| File | Covers |
|---|---|
| `apps/server/src/routes/collaborators.email.test.ts` | Owner sees every collaborator's email (1 test) |
| `apps/server/src/services/collaborators.last-owner.test.ts` | Last-owner rule under concurrency (3 tests) |
| `apps/server/src/services/docs.save.concurrency.test.ts` | Concurrent saves keep both edits (1 test) |

### Gaps visible so far (before planning)

- No test checks that a **non-owner** gets `email: null`. This is the privacy half of the fix.
- No test for the `"A collaborator"` push fallback.
- No component test for the collaborator-list fallback name or the hidden email line.
- No test for `MobileNavPushRow` hiding while push is `checking` / `unavailable`.

These tests have not been mutation-proven yet.

---

## Running the tests yourself

Run per project. A root `vitest run` with `-t` breaks name filtering across the two projects.

```bash
pnpm exec vitest run --project server
pnpm exec vitest run --project web
```

Postgres runs persistently via docker compose on `:5432`, so server integration tests need no extra setup.

## Loose ends

- Run 2 never recorded `run.finished`, so it has no final verdict or compliance check.
- The two unproven tests from Run 2 need fixing, or the cascade check needs a schema-level mutation someone is allowed to make.
- Run 1's product bug (editors can't rename) has no recorded fix.
- Run 3 needs a basis and plan before tests are written for the gaps above.
