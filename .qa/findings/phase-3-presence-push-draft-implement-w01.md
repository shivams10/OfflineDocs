## Tests written

| Test | File | Level | AC | Failed-when-broken | Status |
|---|---|---|---|---|---|
| TS-4 — knowing an endpoint string does not let you unsubscribe someone else | `apps/server/src/services/push.subscription.test.ts` | integration (real Postgres) | AC-133 | `deleteMany` `where` scoped by `userId, endpoint` mutated to `endpoint` alone | proof queued |
| TS-5 — a shared browser's endpoint moves to whoever signed in last | `apps/server/src/services/push.subscription.test.ts` | integration (real Postgres) | AC-132 | upsert's `update` clause mutated to drop `userId`, leaving ownership unchanged on re-subscribe | proof queued |
| TS-8 — a subscriber with no role on the document receives nothing | `apps/server/src/services/push.targeting.test.ts` | integration (real Postgres + real debounce timer) | AC-125 | `collaborations: { some: { docId } }` dropped from the recipient `where`, broadcasting to every subscriber but the saver | proof queued |
| TS-9 — access removed during the debounce window removes the recipient | `apps/server/src/services/push.targeting.test.ts` | integration (real Postgres + real debounce timer) | AC-125 | same ACL-scoping line dropped — a revoked collaborator would still receive the send since nothing checks current access at fire time | proof queued |

All four pass against the current implementation (`pnpm exec vitest run --project server -t "push"` — 18 passed, 0 failed, including other agents' concurrently-written files in this wave). Proof manifest is at `.qa/runs/proof-w01.json`, written incrementally as each test went green.

## Source changes

None. `apps/server/src/services/push.ts` was read only, never edited. `git diff --name-only` before finishing shows no source files touched by this agent; the only untracked/modified files this agent produced are the two test files above and the proof manifest.

## Not written

None — all four assigned scenarios (TS-4, TS-5, TS-8, TS-9) were written and proven-passing.

## Prerequisites needed

None beyond what the brief already documented (local Postgres running persistently, which it is).

## Observations

- **A real-DB / fake-timers incompatibility, worth flagging for future integration tests of `push.ts` (and any other debounce-driven code against a real database):** `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` does not reliably wait out a *real* Postgres round trip triggered from inside the fake-timer callback — sinon's fake clock fast-forwards the `setTimeout` but doesn't block for genuine I/O the way it does for a mocked, synchronously-resolved Prisma client (which is what `push.debounce.test.ts` uses). I hit this directly: TS-8 failed intermittently with `sendNotification` called 0 times under fake timers, purely as an artifact of the timing harness, not the code under test.
  - Resolved for TS-8/TS-9 by mocking `PUSH_DEBOUNCE_MS` down to a short **real** value (150ms) via the existing `../config/env.js` mock seam, and using real timers: `vi.waitFor(...)` to await the positive case (TS-8) and a bounded real `setTimeout` wait past the window to assert the negative case (TS-9), per the project's own determinism guidance (`toPass`/`waitFor` preferred over fixed sleeps; the one unavoidable fixed wait is for the negative assertion in TS-9, which by nature has no positive event to poll for).
  - Not a product bug — just noting it so nobody re-discovers this the hard way and reaches for `vi.useFakeTimers()` again on a real-DB push/notification test.
- No other issues observed in `push.ts` itself while reading it closely for these four scenarios; the upsert-on-unique-endpoint and the ACL/exclusion `where` clause both match their AC text exactly.
