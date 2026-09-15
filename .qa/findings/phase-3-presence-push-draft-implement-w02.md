# Implement report — w02 (push.ts / sw-push.js)

Run: `20260914-141157-3db533b-3x9v`
Scope: TS-10, TS-13, TS-14, TS-15 (AC-126, AC-127, AC-128, AC-129)

## Tests written

| Test | File | Level | AC | Failed-when-broken | Status |
|---|---|---|---|---|---|
| carries exactly docId, docTitle, editorName, changeSummary and nothing else | `apps/server/src/services/push.part2.test.ts` | integration | AC-126 | Yes — verified: widening the payload with an extra `body` field kills it | Passing, proven |
| suppresses the OS notification and posts to the tab already focused on that document | `apps/web/public/sw-push.test.ts` | unit | AC-127 | Yes — verified: neutering the `if (focused)` guard kills it | Passing, proven |
| shows an OS notification naming the editor and the change when no tab is focused on that document | `apps/web/public/sw-push.test.ts` | unit | AC-128 | Yes — verified: dropping `editorName` from the body kills it | Passing, proven |
| scopes the notification tag to the document so a save to a different doc does not replace it | `apps/web/public/sw-push.test.ts` | unit | AC-128 | Yes — verified: making the tag constant across docs kills it | Passing, proven |
| focuses an existing tab already showing the document, without opening a new one | `apps/web/public/sw-push.test.ts` | unit | AC-129 | Yes — verified: disabling the pathname-match loop kills it | Passing, proven |
| reuses an open window and navigates it to the document when no tab already shows it | `apps/web/public/sw-push.test.ts` | unit | AC-129 | Yes — verified: disabling the `navigate` fallback branch kills it | Passing, proven |
| opens a new window to the document when no client is open at all | `apps/web/public/sw-push.test.ts` | unit | AC-129 | Yes — verified: passing the wrong URL to `openWindow` kills it | Passing, proven |
| skips a client whose URL cannot be parsed instead of throwing, and still matches a later one | `apps/web/public/sw-push.test.ts` | unit | AC-129 | Yes — verified: removing the try/catch (so an unparseable URL throws instead of being skipped) kills it | Passing, proven |

All 8 tests pass against the current code (`pnpm exec vitest run apps/server/src/services/push.part2.test.ts` and `pnpm exec vitest run apps/web/public/sw-push.test.ts`). I additionally hand-verified every mutation myself (apply → run with `-t` → confirm failure → revert → confirm source file byte-identical to original) before writing the proof manifest, since the manifest is what `qa-runner`/`qa-prove.mjs` will re-verify independently. All 8 mutants were killed.

Proof manifest: `.qa/runs/proof-w02.json` (8 entries — 1 for push.ts, 7 for sw-push.js).

## Source changes

None. `apps/server/src/services/push.ts` and `apps/web/public/sw-push.js` are unmodified — confirmed with `git diff` (empty) after my hand-verification pass reverted every mutation it applied.

## Deviation from the brief's suggested test path

The brief names the sw-push test file `apps/web/public/sw-push.test.js`. I wrote
`apps/web/public/sw-push.test.ts` instead (same directory, same stem, `.ts` extension).
Reason: `apps/web/vitest.config.ts` sets `include: ["**/*.test.{ts,tsx}"]` — a `.test.js`
file under `public/` would never be collected by vitest and would silently never run,
which the scenario notes themselves flagged as a risk ("check the web vitest project's
include pattern before choosing the path"). No other agent owns `apps/web/public/sw-push.js`
or this test stem, so this shouldn't collide with anyone else's work — just flagging the
filename change explicitly as instructed.

`sw-push.js` itself has no imports/exports (it's a classic-script service worker, not an ES
module), so the test loads its source text and evaluates it via Node's `vm` module against a
hand-built fake `self` (addEventListener capturing the `push`/`notificationclick` handlers,
`clients.matchAll`/`openWindow` and `registration.showNotification` mocked). This is the
standard technique for unit-testing a service worker without a browser and is the only way
the file is reachable at unit level, as the scenario notes said.

## Not written

Nothing was skipped — all 4 assigned scenarios (TS-10, TS-13, TS-14, TS-15) are covered.
TS-14's "would fail if" line (tag dropped or made constant) is split across two tests: one
for the body/notification-shown assertion, one specifically isolating the tag-uniqueness
claim (`docsync-doc-doc-other` vs a different doc's tag) since that's the part of AC-128 the
scenario said "is what makes TS-15 meaningful."

## Prerequisites needed

None beyond what already exists. TS-10 needed VAPID push "on" to exercise
`queueDocSavedNotification`; the local `apps/server/.env` ships with empty VAPID keys (push
off by default in dev), so the test mocks `../config/env.js` the same way the existing
`push.debounce.test.ts` already does — no new fixture or config needed.

## Observations

- Nothing that looks like a product bug in the scenarios I covered. `sw-push.js`'s handling
  matches techspec §6 and userflow §4 exactly: payload is the closed 4-field set, suppression
  checks `client.focused` + pathname, the notification tag is scoped per-doc, and the
  notificationclick handler prefers an existing tab (match → focus; else reuse-and-navigate;
  else `openWindow`), skipping any client whose URL fails to parse.
- One thing worth flagging to whoever owns `apps/server/src/controllers/docs.ts`: the push
  payload's `editorName` comes from
  `doc.collaborators.find((row) => row.user.id === userId)?.user.name ?? email`. If a user's
  `name` is ever an empty string (not just null/undefined) rather than unset, `??` won't
  substitute the fallback email — not a bug in the code I own (`push.ts`/`sw-push.js`), just
  worth a note since it feeds the payload TS-10 tests. Not acted on; out of my scope (I don't
  own docs.ts/controllers).
