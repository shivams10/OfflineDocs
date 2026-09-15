# Test Plan: Phase 3 — live presence, web push, draft backup, doc invite

- **Basis:** .qa/basis/phase-3-presence-push-draft.md
- **Run:** 20260914-141157-3db533b-3x9v
- **Mode:** change-scoped (uncommitted working tree on `phase-3.0`, base `3db533b`, 40 changed/new files)
- **Generated:** 2026-09-14
- **Tier:** `auto` → standard → **20 scenarios** (at cap; `qa-budget plan --scenarios 20` fits with 8.7M to spare)
- **Budget:** 5 unit · 9 integration · 2 authz · 4 component · 0 e2e

## Shape and scoring notes, stated once

**Shape.** Config says `trophy`. The change is backend-weighted, so the trophy reads here as: thin
unit (pure functions and the service-worker handlers only), **fat integration + authz** on the
server, **fat component** on the web, no e2e. That is the trophy's centre of gravity applied to
where this change's complexity actually sits.

**Defect history.** There is no `.qa/history/defects.jsonl` in this repo. The history axis is
scored **1 everywhere**. That compresses the top of the range: the arithmetic maximum is 21, so
**no scenario can reach the P0 band (≥24) on score alone.** Every P0 below comes from the
critical-path floor. Read the P1 band as "would be P0 with a history signal" — TS-5, TS-8 and
TS-19 in particular are genuine authorisation/data-loss risks sitting in P1 only because of this.

**Critical-path floor, applied consistently.** `risk.critical_paths` gives a P0 floor. Applied
where the scenario asserts the behaviour of a critical-path file itself (TS-1/2/3 assert the
`csrf.ts` / `auth.ts` guards; TS-12 asserts `services/docs.ts` deletion). **Not** applied where a
critical-path file merely hosts the behaviour under test — TS-11 asserts notification copy that
happens to live in `services/docs.ts`, and floor-promoting a grammar test to P0 would be noise.
Stated so the omission is a decision, not an oversight.

**Not re-planned.** Six test files already exist in this tree and cover presence TTL, the revoked
collaborator, the sweep, draft round-trip/privacy/non-merge, viewer refusal, the debounce window
and burst collapsing, saver exclusion, dead-endpoint pruning, partial send failure, the chips
component and the heartbeat hook. None of that is repeated below. Every scenario here is a gap.

## Risk table

| ID | Scenario | AC | Level | Size | Blast | Change | History | Silent | Priority | Band |
|---|---|---|---|---|---|---|---|---|---|---|
| TS-1 | CSRF header required on the draft heartbeat | AC-134 | integration | medium | 5 | 4 | 1 | 5 | 20 | **P0** (floor) |
| TS-2 | CSRF header required on push subscribe and unsubscribe | AC-134 | integration | medium | 5 | 4 | 1 | 5 | 20 | **P0** (floor) |
| TS-3 | Every push route refuses an anonymous caller | AC-135 | authz | small | 5 | 4 | 1 | 4 | 19 | **P0** (floor) |
| TS-4 | Unsubscribe cannot remove somebody else's subscription | AC-133 | authz | medium | 4 | 5 | 1 | 5 | 19 | P1 |
| TS-5 | A re-used browser endpoint moves to the new signer-in | AC-132 | integration | medium | 5 | 5 | 1 | 5 | 21 | P1 |
| TS-6 | A merged save queues a notification for the document | AC-121 | integration | medium | 3 | 5 | 1 | 5 | 17 | P2 |
| TS-7 | A draft heartbeat queues nothing | AC-114 | integration | medium | 4 | 5 | 1 | 4 | 18 | P1 |
| TS-8 | A subscriber with no role on the doc receives nothing | AC-125 | integration | medium | 5 | 5 | 1 | 5 | 21 | P1 |
| TS-9 | Access removed inside the debounce window excludes the recipient | AC-125 | integration | medium | 4 | 5 | 1 | 5 | 19 | P1 |
| TS-10 | The payload carries exactly the four specified fields | AC-126 | integration | medium | 3 | 5 | 1 | 4 | 16 | P2 |
| TS-11 | Change summary matches its number grammatically | AC-131 | unit | small | 1 | 4 | 1 | 3 | 10 | P3 |
| TS-12 | Deleting a doc takes its drafts and presence rows with it | AC-141 | integration | medium | 4 | 4 | 1 | 4 | 17 | **P0** (floor) |
| TS-13 | The worker suppresses the OS notification for a focused doc | AC-127 | unit | small | 4 | 5 | 1 | 4 | 18 | P1 |
| TS-14 | The worker shows an OS notification when the doc is not focused | AC-128 | unit | small | 3 | 5 | 1 | 4 | 16 | P2 |
| TS-15 | Tapping focuses the existing tab, never a second one | AC-129 | unit | small | 4 | 5 | 1 | 4 | 18 | P1 |
| TS-16 | The in-app notice appears when the worker hands the save over | AC-127 | component | small | 2 | 5 | 1 | 3 | 13 | P2 |
| TS-17 | Revoked access is surfaced and the unsaved text survives it | AC-117 | component | medium | 5 | 4 | 1 | 5 | 20 | P1 |
| TS-18 | You are not shown as somebody else viewing your own doc | AC-109 | component | small | 1 | 4 | 1 | 2 | 9 | P3 |
| TS-19 | An author is offered their own backup when local state is gone | AC-116 | component | medium | 5 | 5 | 1 | 5 | 21 | P1 |
| TS-20 | The cadences honour the TTL ≈ 2× heartbeat relationship | AC-108 | unit | small | 2 | 5 | 1 | 4 | 14 | P2 |

Quadrant coverage across P0/P1: positive TS-6, TS-13, TS-15, TS-16, TS-19 · negative TS-1, TS-2,
TS-3, TS-4, TS-7, TS-8 · boundary TS-11, TS-20 · adversarial TS-5, TS-9, TS-17.

## Scenarios

### TS-1 — the draft heartbeat refuses a request with no CSRF token  `P0` `integration` `AC-134`

- **Covers:** apps/server/src/routes/presence.ts
- **Intent asserted:** techspec §10 requires the `docsync_csrf` cookie to be echoed in an
  `X-CSRF-Token` header on *every* state-changing method, and says the guard is mounted globally
  "so a new endpoint cannot ship without it". `POST /docs/:id/draft` is a new state-changing
  endpoint and must be inside that guard.
- **Level because:** the guard is mounted in `app.ts` ahead of the routers; whether it actually
  covers this path is a property of the composed application, and no unit test of `csrf.ts` can
  tell you whether a router mounted after it was reached.
- **Setup:** a seeded editor with a valid session cookie on a doc they collaborate on.
- **Steps:** 1. POST `/docs/:id/draft` with a valid session, a valid `docsync_csrf` cookie, a
  valid body, and **no** `X-CSRF-Token` header. 2. Repeat with a header that does not match the
  cookie. 3. Repeat with a matching header as the control.
- **Expected:** (1) and (2) are rejected by the CSRF guard with its standard status and error code;
  (3) succeeds. No `DocPresence` or `DocDraft` row is written for (1) or (2).
- **Would fail if:** `draftRouter` were mounted in `app.ts` before `requireCsrfToken` instead of
  after it.
- **Target file:** apps/server/src/routes/presence.test.ts (extend the existing access-control describe)
- **Notes:** reuse the request helpers already in `presence.test.ts`; assert the exact status and
  error code the CSRF middleware emits, not merely "not 2xx".

### TS-2 — push subscribe and unsubscribe refuse a request with no CSRF token  `P0` `integration` `AC-134`

- **Covers:** apps/server/src/routes/push.ts
- **Intent asserted:** same §10 requirement, for the two new mutating push endpoints. `DELETE`
  with a body is an unusual shape and is exactly the kind of route that slips past a guard.
- **Level because:** as TS-1 — mount order is only observable through the assembled app.
- **Setup:** any signed-in user; no document needed, since push subscriptions are per-user.
- **Steps:** 1. `POST /push/subscribe` with a valid body and no `X-CSRF-Token`. 2. `DELETE
  /push/subscribe` with a valid body and no `X-CSRF-Token`. 3. Both again with a matching header.
- **Expected:** (1) and (2) rejected by the CSRF guard; no `PushSubscription` row created or
  deleted. (3) returns `204` in both cases.
- **Would fail if:** `app.use("/push", pushRouter)` were moved above the global
  `requireCsrfToken` mount in `app.ts`.
- **Target file:** apps/server/src/routes/push.test.ts (new)
- **Notes:** `routes/push.ts` has no test file at all today — this is the file's first test.

### TS-3 — every push route refuses an anonymous caller  `P0` `authz` `AC-135`

- **Covers:** apps/server/src/routes/push.ts
- **Intent asserted:** techspec §10 makes the session cookie the only credential; a push
  subscription is user-scoped data and none of the four routes may serve an unauthenticated caller.
- **Level because:** `requireAuth` is applied by `pushRouter.use(...)`; a unit test of the
  middleware proves the middleware works, not that all four routes sit behind it. A route added
  above the `use()` line is the realistic mistake.
- **Setup:** no session cookie.
- **Steps:** call each of `GET /push/vapid-public-key`, `POST /push/subscribe`,
  `DELETE /push/subscribe` with no session (CSRF satisfied, so the 401 is unambiguous).
- **Expected:** `401` from each, with the app's standard unauthenticated error code. The VAPID key
  is not disclosed to an anonymous caller.
- **Would fail if:** `pushRouter.get("/vapid-public-key", ...)` were registered before
  `pushRouter.use(requireAuth)`.
- **Target file:** apps/server/src/routes/push.test.ts (new)
- **Notes:** presence/draft routes already have an equivalent ("requires a session") in
  `presence.test.ts` — do not duplicate it.

### TS-4 — knowing an endpoint string does not let you unsubscribe someone else  `P1` `authz` `AC-133`

- **Covers:** apps/server/src/services/push.ts
- **Intent asserted:** techspec §10 puts every access check server-side. A push endpoint URL is not
  a secret in any meaningful sense; it must not function as an authorisation token for deleting
  another user's subscription.
- **Level because:** the scope comes from the `where: { userId, endpoint }` clause against a real
  table. Mocking Prisma would assert the mock's shape, not that the row survives.
- **Setup:** users A and B; B has a `PushSubscription` row with endpoint `E`.
- **Steps:** 1. Signed in as A, call `removeSubscription(A.id, E)`. 2. Read B's subscriptions.
  3. Call `removeSubscription(B.id, E)` as the control.
- **Expected:** after (1) B's row for `E` still exists and its `userId` is unchanged; the call
  itself does not throw. After (3) the row is gone.
- **Would fail if:** the delete clause dropped `userId` and matched on `endpoint` alone.
- **Target file:** apps/server/src/services/push.subscription.test.ts (new)
- **Notes:** requires the local Postgres (already running persistently per project notes).

### TS-5 — a shared browser's endpoint moves to whoever signed in last  `P1` `integration` `AC-132`

- **Covers:** apps/server/src/services/push.ts
- **Intent asserted:** `PushSubscription.endpoint` is unique **globally**, and techspec §6 stores
  subscriptions per-user. On a shared browser profile, re-subscribing after a different sign-in
  must transfer ownership — the previous user must stop receiving that document's titles on a
  device that is no longer theirs.
- **Level because:** the behaviour is the upsert-on-a-unique-column semantics of a real database.
  Against a mock, a broken `create`-instead-of-`upsert` looks identical until it hits a live
  constraint.
- **Setup:** user A subscribed with endpoint `E` (keys K1).
- **Steps:** 1. Call `saveSubscription(B.id, { endpoint: E, keys: K2 })`. 2. Query all rows for `E`.
  3. Query A's subscriptions.
- **Expected:** exactly one row for `E`; its `userId` is B and its keys are K2. A has no
  subscription for `E` and will not be targeted through it.
- **Would fail if:** `saveSubscription` used `prisma.pushSubscription.create` (or upserted on
  `{ userId, endpoint }`), leaving A's row in place and pushing B's document titles to A's device.
- **Target file:** apps/server/src/services/push.subscription.test.ts (new)
- **Notes:** the highest-consequence gap in the push half — an authorisation leak that no existing
  test touches. Banded P1 only because the history axis has no data (see scoring note).

### TS-6 — saving a document queues a notification for it  `P2` `integration` `AC-121`

- **Covers:** apps/server/src/controllers/docs.ts
- **Intent asserted:** techspec §6 — the backend sends Web Push "as soon as a Save request is
  merged". The existing debounce tests exercise `queueDocSavedNotification` directly and prove
  nothing about whether the save path ever calls it.
- **Level because:** the assertion is that the controller, its service and the queue are wired
  together through a real save request; a unit test of the controller would need the wiring stubbed
  and so could not observe it.
- **Setup:** a doc with an owner and a second collaborator, both with push subscriptions; VAPID
  configured in the test env; the web-push transport stubbed.
- **Steps:** 1. POST a valid save as the owner. 2. Advance fake timers past the debounce window.
- **Expected:** exactly one send is attempted, carrying this doc's id and title; the save response
  itself is unaffected.
- **Would fail if:** the `queueDocSavedNotification(...)` call were removed from
  `controllers/docs.ts#save` — the save would still return 200 and nothing else would notice.
- **Target file:** apps/server/src/routes/docs.push.test.ts (new)
- **Notes:** also pins the ordering intent — the notification is queued after the merge is durable,
  so a send failure must never turn a successful save into an error response.

### TS-7 — backing a draft up notifies nobody  `P1` `integration` `AC-114`

- **Covers:** apps/server/src/services/presence.ts
- **Intent asserted:** techspec §4.1 — a draft backup "does **not** trigger a push notification".
  It is private, unreviewed, per-user text; buzzing every collaborator every 25 seconds would be
  both a privacy surprise and a product disaster.
- **Level because:** the guarantee is the *absence* of a call across the heartbeat's whole path
  (route → controller → service). Asserting absence one level down would only prove the function
  you happened to look at is clean.
- **Setup:** a doc with two collaborators, both subscribed; VAPID configured; transport stubbed.
- **Steps:** 1. POST `/docs/:id/draft` with a real update, as an editor. 2. Advance fake timers
  well past the debounce window. 3. Repeat the heartbeat three times.
- **Expected:** zero sends attempted and zero pending notifications for that doc, after every beat.
- **Would fail if:** `recordHeartbeat` (or the heartbeat controller) called
  `queueDocSavedNotification`, e.g. by someone "unifying" the save and backup paths.
- **Target file:** apps/server/src/routes/docs.push.test.ts (new)
- **Notes:** pairs with TS-6 in one file — same fixtures, opposite expectation.

### TS-8 — a subscriber with no role on the document receives nothing  `P1` `integration` `AC-125`

- **Covers:** apps/server/src/services/push.ts
- **Intent asserted:** techspec §8 — push is "only sent to … users who currently have at least
  Viewer access". A subscription is per-user and document-agnostic, so the ACL filter at send time
  is the *only* thing standing between a stranger and a document's title and editor's name.
- **Level because:** the filter is a relational query (`user.collaborations.some({ docId })`)
  evaluated by the database. A mocked client would return whatever the test told it to.
- **Setup:** a doc with an owner and one editor; plus a third signed-up user with a valid push
  subscription and no role on that doc at all.
- **Steps:** 1. Queue a saved-doc notification for the doc, saved by the owner. 2. Advance past the
  debounce window. 3. Inspect the endpoints the transport was called with.
- **Expected:** exactly one send, to the editor's endpoint. The unrelated user's endpoint is never
  called and their subscription is untouched.
- **Would fail if:** the `where` clause dropped `user: { collaborations: { some: { docId } } }` and
  selected every subscription except the saver's — broadcasting every save to every user on the
  instance.
- **Target file:** apps/server/src/services/push.targeting.test.ts (new)
- **Notes:** the existing `push.debounce.test.ts` asserts saver-exclusion only; the ACL half of the
  same `where` clause is untested. Keep this in a separate file so the two concerns stay legible.

### TS-9 — access removed during the debounce window removes the recipient  `P1` `integration` `AC-125`

- **Covers:** apps/server/src/services/push.ts
- **Intent asserted:** §8 says "**currently** have at least Viewer access". The recipient list must
  be resolved when the notification fires, not captured when the save landed — otherwise removing
  somebody is followed, seconds later, by a notification about the document they just lost.
- **Level because:** the "when is it read" question only has meaning against a store that can
  change between the two moments; it is invisible to any level that does not have a real database
  and a real timer.
- **Setup:** a doc with an owner and a collaborator, the collaborator subscribed; transport stubbed;
  fake timers.
- **Steps:** 1. Queue a saved-doc notification for a save by the owner. 2. Before the window
  elapses, delete the collaborator's `DocCollaborator` row. 3. Advance past the window.
- **Expected:** no send is attempted; the collaborator's endpoint is never called.
- **Would fail if:** `sendDocSavedNotification` resolved and cached its recipient list inside
  `queueDocSavedNotification` at save time instead of querying when the timer fires.
- **Target file:** apps/server/src/services/push.targeting.test.ts (new)
- **Notes:** adversarial-quadrant scenario; complements TS-8's static case with a time-of-check /
  time-of-use one.

### TS-10 — the notification payload carries exactly the four specified fields  `P2` `integration` `AC-126`

- **Covers:** apps/server/src/services/push.ts
- **Intent asserted:** techspec §6 fixes the payload at `{ docId, docTitle, editorName,
  changeSummary }` and notes payloads are size-limited. This is also the boundary where document
  *content* must not leak — the payload names what changed, never the text.
- **Level because:** the payload is built from a doc record and a collaborator lookup that only
  exist against the database; building it from hand-made objects would assert the fixture.
- **Setup:** a doc titled distinctively, an owner with a display name, and a subscribed
  collaborator; transport stubbed to capture the serialised body.
- **Steps:** 1. Save the doc as the owner. 2. Advance past the window. 3. Parse the captured body.
- **Expected:** the parsed object's keys are exactly `docId`, `docTitle`, `editorName`,
  `changeSummary` — no extras, and in particular no snapshot, update bytes or document text.
- **Would fail if:** the payload were widened, e.g. `{ ...payload, snapshot }` or a `body` field
  carrying the merged text.
- **Target file:** apps/server/src/services/push.targeting.test.ts (new)
- **Notes:** assert the key set with an exact comparison, not `toMatchObject` — the value of this
  test is catching what was *added*.

### TS-11 — the change summary agrees in number with what changed  `P3` `unit` `AC-131`

- **Covers:** apps/server/src/services/docs.ts
- **Intent asserted:** techspec §4's example copy is "Priya added 3 lines". One line is "1 line",
  not "1 lines", and a save that changes no line count still needs to say something.
- **Level because:** unit is the level — a pure function of two strings. (The critical-path floor
  on `services/docs.ts` is deliberately not applied here: this asserts notification copy, not the
  merge path the floor exists to protect.)
- **Setup:** none. `describeChange` will need exporting from `services/docs.ts` for testability.
- **Steps:** call the summary function across the boundaries: +1 line, +3 lines, −1 line,
  −3 lines, no line change with edited text, and empty-to-empty.
- **Expected:** "added 1 line", "added 3 lines", "removed 1 line", "removed 3 lines", and the
  no-line-change wording for the last two.
- **Would fail if:** the singular branch were dropped, i.e. always emitting `${n} lines`.
- **Target file:** apps/server/src/services/docs.summary.test.ts (new)
- **Notes:** **AC-131 is disputed** — techspec §4 specifies attribution from the client-id in the
  Yjs update, while the implementation uses a line-count delta (basis U-7). Assert the grammar,
  which is uncontested; do not encode the mechanism until U-7 is answered.

### TS-12 — deleting a document takes its drafts and presence rows with it  `P0` `integration` `AC-141`

- **Covers:** apps/server/src/services/docs.ts
- **Intent asserted:** the schema declares `onDelete: Cascade` on `DocDraft` and `DocPresence`,
  and master spec line 546 requires a doc delete to cascade. Two new tables now hang off `Doc`;
  either they clean up, or deletion starts failing on a foreign key, or a departed document leaves
  someone's private draft text behind.
- **Level because:** referential actions are enforced by Postgres. There is no level below the
  database at which a cascade can be observed at all.
- **Setup:** a doc with two collaborators, a draft backup row for each, and fresh presence rows for
  both.
- **Steps:** 1. Call `deleteDoc(docId)`. 2. Query `DocDraft` and `DocPresence` for that docId.
- **Expected:** the delete succeeds, and both tables return zero rows for the doc.
- **Would fail if:** `onDelete: Cascade` were dropped from either relation in `schema.prisma` — the
  delete would then reject with a foreign-key violation.
- **Target file:** apps/server/src/services/docs.cascade.test.ts (new)
- **Notes:** `prisma/migrations/**` and `schema.prisma` are under `boundaries.never_modify` — the
  test reads their effect, never edits them. Proving this red requires a scratch worktree.

### TS-13 — the worker stays silent for a document you are already looking at  `P1` `unit` `AC-127`

- **Covers:** apps/web/public/sw-push.js
- **Intent asserted:** techspec §6 — the receiving worker checks `clients.matchAll()` and suppresses
  the OS notification, showing an in-app toast/badge instead, when that document is already open and
  focused in one of its own tabs. This is the only place the suppression decision can be made, since
  the design has no server-side "active connection" to filter on.
- **Level because:** unit is the right level — the handler is a pure function of a fake `self`.
  No lower level exists, and driving a real push through Playwright needs a live push service.
- **Setup:** a fake `self` with `addEventListener`, `clients.matchAll`, `registration
  .showNotification` and a client list containing a focused window at `/doc/<id>`.
- **Steps:** 1. Load `sw-push.js` against the fake global. 2. Dispatch a `push` event whose data
  parses to a payload for that docId. 3. Await the handler's `waitUntil` promise.
- **Expected:** `showNotification` is never called; the focused client receives
  `postMessage({ type: "docsync:doc-saved", payload })` with the payload intact.
- **Would fail if:** the `if (focused)` early return were removed, so both the postMessage and the
  OS notification fired.
- **Target file:** apps/web/public/sw-push.test.ts (new; or `apps/web/lib/push/sw-push.test.ts`
  loading the file — follow whichever the web project's vitest include globs allow)
- **Notes:** check the web vitest project's `include` pattern before choosing the path; `public/`
  may be excluded, in which case the test lives under `lib/push/` and loads the file by path.

### TS-14 — an unfocused recipient gets an OS notification naming the editor and the change  `P2` `unit` `AC-128`

- **Covers:** apps/web/public/sw-push.js
- **Intent asserted:** userflow §4 (S) — "Show OS notification: 'X saved doc — N changes'". The
  notification must identify the document in its title and the editor plus what they did in its body.
- **Level because:** as TS-13 — a fake service-worker global is the only place this handler is
  reachable.
- **Setup:** the same fake `self`, with a client list containing no focused client for that doc
  (an unfocused tab on a different path).
- **Steps:** 1. Dispatch a `push` event with `{ docId, docTitle, editorName, changeSummary }`.
  2. Await `waitUntil`.
- **Expected:** `showNotification` called once with the doc title, a body combining editorName and
  changeSummary, a `tag` scoped to the docId (so a second save replaces rather than stacks), and
  `data.docId` set for the click handler to use.
- **Would fail if:** the `tag` were dropped or made constant across documents — saves to two
  different docs would then replace each other's notification, silently losing one.
- **Target file:** apps/web/public/sw-push.test.ts (new)
- **Notes:** the `data.docId` assertion is what makes TS-15 meaningful; keep them in one file.

### TS-15 — tapping a notification focuses the tab that already has the doc  `P1` `unit` `AC-129`

- **Covers:** apps/web/public/sw-push.js
- **Intent asserted:** techspec §6 "primary tap deep-links to the document"; userflow §4 (U)
  "focus/open client". A second tab of a document being edited means two `Y.Doc`s with divergent
  local drafts on one device — the kind of duplication the offline-first model must not create.
- **Level because:** as TS-13. There is no lower level, and no e2e harness can deliver a real
  `notificationclick`.
- **Setup:** fake `self` with a client list containing one window at `/doc/<id>` and one at
  `/dashboard`; `openWindow` and `navigate` spied.
- **Steps:** 1. Dispatch `notificationclick` with `data.docId` set. 2. Await `waitUntil`.
  3. Repeat with a client list that has no tab for the doc.
- **Expected:** (1–2) the matching client is focused; `openWindow` and `navigate` are not called.
  (3) the existing window is focused and navigated to `/doc/<id>`, or a window is opened — never a
  second tab alongside a matching one.
- **Would fail if:** the loop matching `new URL(client.url).pathname === target` were removed and
  the handler always called `openWindow`.
- **Target file:** apps/web/public/sw-push.test.ts (new)
- **Notes:** also covers the boundary where a client has an unparseable URL — it must be skipped,
  not thrown on.

### TS-16 — the in-app notice appears when the worker hands a save to the page  `P2` `component` `AC-127`

- **Covers:** apps/web/components/documents/doc-saved-notice.tsx
- **Intent asserted:** §6's suppression is only acceptable because the user still learns about the
  save — "showing an in-app toast/badge update instead". TS-13 proves the worker sends the message;
  this proves the page does something visible with it.
- **Level because:** the behaviour is a rendered result of a `message` event on a real DOM; the
  component's contract with the worker is the message shape, which a unit test of a handler
  function would not exercise end to end.
- **Setup:** render `DocSavedNotice` for a docId inside the project's existing test providers.
- **Steps:** 1. Dispatch a `message` event on `navigator.serviceWorker` with
  `{ type: "docsync:doc-saved", payload }` for that doc. 2. Dispatch one for a *different* docId.
  3. Dispatch one with an unrelated `type`.
- **Expected:** (1) a visible notice naming the editor and the change appears. (2) and (3) render
  nothing — a notice about another document must not appear on this one.
- **Would fail if:** the `type !== "docsync:doc-saved"` guard were inverted or the docId comparison
  dropped, so any worker message rendered a notice.
- **Target file:** apps/web/components/documents/doc-saved-notice.test.tsx (new)
- **Notes:** run with `pnpm exec vitest run --project web`.

### TS-17 — losing access is surfaced, and the unsaved text survives it  `P1` `component` `AC-117`

- **Covers:** apps/web/components/documents/doc-editor.tsx
- **Intent asserted:** techspec §9 — on a 403/404 heartbeat "client surfaces a 'you no longer have
  access' state instead of silently failing". The editor must announce it, and the user's unsaved
  local work must not be destroyed by somebody else's permission change.
- **Level because:** the behaviour is the composition of the heartbeat hook's `accessRevoked` flag
  with what the editor renders and keeps; the hook's own tests already prove the flag, and only a
  rendered editor can show whether the text is still there.
- **Setup:** render `DocEditor` for a doc the user can edit, with the draft API mocked; type into
  the body so there is unsaved text.
- **Steps:** 1. Make the next heartbeat resolve as a lost-access response. 2. Wait for the state to
  settle. 3. Read the alert region and the editor's text.
- **Expected:** an element with `role="alert"` carrying the access-revoked copy is present; the
  typed text is still in the editor and is offered for copying; presence polling has stopped.
- **Would fail if:** the revoked branch cleared `body` or unmounted the editor surface — the user's
  unsaved work would vanish the moment an owner removed them.
- **Target file:** apps/web/components/documents/doc-editor.revoked.test.tsx (new)
- **Notes:** **basis U-4 is open** — preservation is an assumption, not a stated requirement. If
  product says the draft should be discarded, this scenario's expectation inverts. Flag it in the
  test's description rather than silently encoding the assumption.

### TS-18 — you are not listed as someone else viewing your own document  `P3` `component` `AC-109`

- **Covers:** apps/web/components/documents/doc-editor.tsx
- **Intent asserted:** techspec §7 frames presence as "who **else** has this doc open". The API
  returns everyone present including the caller by design, so the editor is the only place the
  caller gets filtered out.
- **Level because:** the filter is in the editor, not in `PresenceChips` (whose own tests pass it a
  pre-filtered list). Only a rendered editor with a session exercises it.
- **Setup:** render `DocEditor` with a mocked session for user A and a presence response listing
  A and B.
- **Steps:** 1. Render. 2. Read the presence chips region.
- **Expected:** B is named; A is not. With a presence response listing only A, no chips render.
- **Would fail if:** the `person.userId !== me?.id` filter were dropped from `DocEditorLoaded`.
- **Target file:** apps/web/components/documents/doc-editor.presence.test.tsx (new)
- **Notes:** lowest-value scenario in the plan; included because the filter has no other home and a
  session-less render (`me` undefined) is a real edge — confirm it does not then list everyone.

### TS-19 — an author is offered their own backup when local state is gone  `P1` `component` `AC-116`

- **Covers:** apps/web/lib/api/presence.ts
- **Intent asserted:** techspec §4.1's entire justification — local IndexedDB "doesn't help if
  storage is cleared or the user never comes back on that device", so the server holds a private
  backup "to resume their own draft". A backup that is written but never read back is not a backup.
- **Level because:** the restore is a wiring question between the editor, the draft API and the Yjs
  document. The server round-trip is already proven at integration level; what is unproven is that
  anything on the client ever asks for it.
- **Setup:** render `DocEditor` for a doc whose server snapshot is older than the user's backup,
  with `GET /docs/:id/draft` mocked to return a stored update and no local IndexedDB state.
- **Steps:** 1. Render the editor. 2. Wait for loading to settle. 3. Read the editor body and any
  restore affordance.
- **Expected:** the backed-up draft is fetched and its content is available to resume — either
  applied to the document or offered behind an explicit restore control.
- **Would fail if:** nothing calls `fetchDraft()` — **which is the state of the code today.**
- **Target file:** apps/web/components/documents/doc-editor.draft-restore.test.tsx (new)
- **Notes:** **Expected to fail as written.** `fetchDraft` is exported from
  `apps/web/lib/api/presence.ts` and has no caller anywhere in the web app; `use-yjs-doc.ts` seeds
  from the server snapshot only. Treat a red here as the **defect report** for basis U-2, not as a
  test to be adjusted until green. Do not write it green against current behaviour — that is
  precisely the tautology this basis exists to prevent. If U-2 comes back "deferred", move this
  scenario to Blocked rather than deleting it.

### TS-20 — the cadences honour the TTL ≈ 2× heartbeat relationship  `P2` `unit` `AC-108`

- **Covers:** apps/server/src/config/env.ts
- **Intent asserted:** techspec §7 ties the numbers together: "TTL of roughly 60s (~2x the heartbeat
  interval)", heartbeat "every ~20–30s" (§4.1), poll "every ~15–20s". The relationship is the
  requirement — a TTL that drops below the heartbeat interval makes live collaborators blink in and
  out of the chips for no visible reason.
- **Level because:** constants and their invariants; unit is the cheapest level that can hold them.
- **Setup:** none.
- **Steps:** read `PRESENCE_TTL_SECONDS`, `PRESENCE_HEARTBEAT_INTERVAL_SECONDS`,
  `PRESENCE_POLL_INTERVAL_SECONDS` and the web's poll constant, and assert the spec's bands and
  relationships.
- **Expected:** heartbeat within 20–30s; poll within 15–20s; TTL ≥ 2× heartbeat; poll < TTL.
- **Would fail if:** someone "tuned" `PRESENCE_TTL_SECONDS` down to 20 to make a flaky test pass —
  the invariant breaks while every individual constant still looks plausible.
- **Target file:** apps/server/src/config/presence-cadence.test.ts (new)
- **Notes:** the web constant is a module-private `POLL_INTERVAL_MS` in `use-presence.ts`; if
  exporting it is unwelcome, assert the server three and note the client half in the test's
  description rather than reaching into the module.

## Level distribution

| Level | Planned | Target for `trophy` | Verdict |
|---|---|---|---|
| unit | 5 (25%) | thin | on target — pure functions and the SW handlers only |
| integration | 9 (45%) | fat | on target — the change's centre of gravity |
| authz | 2 (10%) | (part of the fat middle) | on target |
| component | 4 (20%) | fat | on target |
| e2e | 0 (0%) | thin | **deliberately zero** — see below |

Shape used: **`trophy`**, as configured, read for a backend-weighted change — thin unit, fat
integration/authz/component, no e2e.

- **Ice cream cone?** No — zero e2e.
- **Hourglass?** No — the integration/authz/component middle is 75% of the plan.
- **Cupcake?** No. The one deliberate overlap is logic-below / wiring-above: `push.debounce.test.ts`
  already proves the debounce and targeting logic in the service, and TS-6 adds exactly **one**
  test that the save path is actually connected to it. That is the legitimate pattern, stated so it
  does not read as duplication.

**Why no e2e.** The one flow that genuinely wants a browser — editor saves, collaborator's device
receives an OS notification — cannot be driven by Playwright without a real push service and two
browser profiles with granted notification permission. Every other behaviour here is reachable at a
cheaper level. `e2e.max_per_plan` is 5 and the harness is ready (auth setup and role storage states
exist), so this is a choice about value, not a capability gap. The residual risk is booked below.

## Not testing, deliberately

| Area | Why | Residual risk | Who accepts it |
|---|---|---|---|
| Doc invite (AC-136…AC-140) | The `DocInvite` table is migrated but **orphaned** — nothing in `apps/` reads or writes it, and `services/collaborators.ts` (unchanged here) still rejects unknown emails with `invite_user_not_found`, the behaviour master spec line 737 records as *rejected*. There is no behaviour to test | The migration ships a table with no code. A later branch may implement it against a schema nobody validated; the rejected UX stays live meanwhile | Product / implementer, via basis U-3 |
| End-to-end push delivery through a real push service | Needs VAPID keys, a live push endpoint and two granted browser profiles | A break in the real `webpush.sendNotification` transport or VAPID signing is caught only in manual checks | QA lead |
| `beforeunload` fallback before the first backup tick (AC-119) | The behaviour was not located in the change and no copy is specified | A user who types and closes within the first ~25s loses that work with no warning — the exact window §4.1 says to cover | Product, via basis U-8 |
| Push off when VAPID keys are absent | Observed, not specified — no source describes an unconfigured server | A production deploy missing one of the three VAPID vars silently sends nothing, and nothing alerts | Ops / product, via basis Observed |
| `clearOwnDraft` on save | Observed, not specified (basis U-6). Testing it would assert the implementation | If discarding the backup is wrong, a user who saves then keeps typing has no server-side safety net for the new edits | Product, via basis U-6 |
| Presence chip loading and poll-error states | No oracle exists for either (basis U-5) | A failed poll may clear the chips or freeze a stale list; either could be the wrong answer and nobody would know | Product, via basis U-5 |
| Opportunistic presence sweep (`PRESENCE_SWEEP_AFTER_SECONDS`) | Unspecified; a housekeeping detail | `DocPresence` grows unbounded between sweeps at higher volume | Accepted at MVP scale (techspec §7 explicitly sizes this "no Redis needed") |
| `push-toggle.tsx`, `app-topbar.tsx`, `labels.ts`, `routes.ts`, `presence-chips.tsx` | Pure presentation, or already covered (`presence-chips.test.tsx`) | A wiring mistake in the toggle leaves push un-subscribable with no failing test | QA lead — deprioritised by instruction |
| `lib/push/subscribe.ts` and `use-push.ts` | Thin wrappers over browser APIs (`Notification.requestPermission`, `pushManager.subscribe`) that mock down to asserting the mock | Permission-denied and unsupported-browser paths are unproven; a user could see an "on" toggle with no subscription behind it | QA lead |
| `validators/push.ts` / `validators/presence.ts` schema rejection | Zod's own behaviour; the routes' `validate()` middleware is established convention elsewhere in the repo | A widened schema (e.g. `endpoint` no longer `z.url()`) would not be caught | QA lead |

## Level gaps

- **contract** is not in `levels.available`. The push payload shape (AC-126) and the `@docsync/shared`
  response types are genuinely contract-level concerns — the service worker and the server must agree
  on `{ docId, docTitle, editorName, changeSummary }` across a boundary with no shared type check at
  runtime. TS-10 asserts the producer side at integration level and TS-13/TS-14 assert the consumer
  side at unit level; a single contract test would replace both halves and catch a drift neither
  sees. Setting it up would mean adding a schema-snapshot check over `packages/shared/src/types.ts`
  plus the SW's expectations — roughly a day, and not justified by this change alone.
- **a11y** is not available. AC-109's chips and AC-117's revoked banner both carry the §4 /
  PRD §10 requirement that status be conveyed "by label and icon, not colour alone". TS-17 asserts
  `role="alert"` and TS-18 asserts accessible names as a partial substitute; contrast and
  icon-plus-label are left to the manual checklist.

## Blocked on UNKNOWNs

| Basis | Question | What it blocks |
|---|---|---|
| U-2 | Is draft restore in scope on this branch? | TS-19 is planned and expected to fail. If the answer is "deferred", it moves here rather than being written green |
| U-3 | Is `DocInvite` meant to be implemented here? | AC-136…AC-140 — five criteria, no scenarios. Unblocking adds roughly 5 scenarios to a later plan |
| U-4 | On revoked access, preserve or discard the unsaved draft? | TS-17's expectation. Written to the preserve assumption; inverts if product says discard |
| U-7 | Is a line-count delta acceptable for `changeSummary` where §4 specifies client-id attribution? | TS-11 asserts only the grammar, deliberately avoiding the mechanism |
| U-1 | Was techspec §16 conflict #1 ("do not build Phase 3 until answered") ever answered? | Nothing structurally, but TS-2…TS-15 cover ~10 scenarios' worth of possibly-unsanctioned scope |

## Manual checks

1. **Real push round trip.** Two browser profiles, both signed in, both opted in, both collaborators
   on one doc. A saves; confirm B's device shows an OS notification within ~5 seconds naming A and
   the change.
2. **Suppression on the real thing.** With B focused on the same document, A saves; confirm B sees
   the in-app notice and **no** OS notification.
3. **Tap-through.** With the doc open in a background tab, tap B's notification; confirm the
   existing tab is focused, not a second one opened.
4. **Permission denied.** Deny notifications on B's device, have A save; confirm no OS prompt or
   notification, and that the in-app notice still works when B has the app open (AC-130).
5. **Colour-independence.** Confirm the presence chips and the access-revoked banner read correctly
   in greyscale — label and icon, not colour alone (techspec §4 / PRD §10).
6. **Unconfigured server.** Start the API with the VAPID vars unset; confirm the app still works,
   saves still succeed, and the push toggle hides rather than offering something that cannot work.
