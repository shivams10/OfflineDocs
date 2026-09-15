# Implement report — w03 (push.ts, docs.ts)

Run: resolved from `.qa/sessions/.current`. Runner: `pnpm exec vitest run --project server`.

## Tests written

| Test | File | Level | AC | Failed-when-broken | Status |
|---|---|---|---|---|---|
| refuses subscribe and unsubscribe with no X-CSRF-Token header, and writes nothing | `apps/server/src/routes/push.test.ts` | integration | AC-134 | mutation: mount `/push` before `requireCsrfToken` in `app.ts` | written, passes, proof queued |
| accepts subscribe and unsubscribe once the header matches the cookie (control) | `apps/server/src/routes/push.test.ts` | integration | AC-134 | (control for the above; no separate mutation) | written, passes |
| returns 401 from every push route for an anonymous caller, without disclosing the VAPID key | `apps/server/src/routes/push.test.ts` | authz | AC-135 | mutation: register `GET /vapid-public-key` before `pushRouter.use(requireAuth)` | written, passes, proof queued |
| says '1 line' (singular) for a single added line | `apps/server/src/services/docs.summary.test.ts` | unit | AC-131 | mutation: drop the singular branch in the "added" wording | written, passes, proof queued |
| says '3 lines' (plural) for three added lines | `apps/server/src/services/docs.summary.test.ts` | unit | AC-131 | (same function, covered by the mutation above) | written, passes |
| says '1 line' (singular) for a single removed line | `apps/server/src/services/docs.summary.test.ts` | unit | AC-131 | (same function) | written, passes |
| says '3 lines' (plural) for three removed lines | `apps/server/src/services/docs.summary.test.ts` | unit | AC-131 | (same function) | written, passes |
| non-line-count wording when text changes but not line count | `apps/server/src/services/docs.summary.test.ts` | unit | AC-131 | (same function) | written, passes |
| non-line-count wording for an empty-to-empty save | `apps/server/src/services/docs.summary.test.ts` | unit | AC-131 | (same function) | written, passes |
| leaves zero DocDraft and DocPresence rows for the doc once it is deleted | `apps/server/src/services/docs.cascade.test.ts` | integration | AC-141 | mutation: `onDelete: Cascade` → `onDelete: Restrict` on `DocDraft.doc` in `schema.prisma` | written, passes, proof queued |

All 10 tests run green against the current implementation (`pnpm exec vitest run --project server src/routes/push.test.ts src/services/docs.summary.test.ts src/services/docs.cascade.test.ts` → 3 files, 10 tests, all passing).

Proof manifest: `.qa/runs/proof-w03.json` — one `mutate` entry per test that introduces a new mutation point (4 entries; the two "control"/companion assertions in the same `it`-block-adjacent tests share their neighbor's mutation since breaking the shared code path fails both).

## Source changes

- `apps/server/src/services/docs.ts`: added `export` to `describeChange` (was a private, unexported function). Purely for testability — TS-11 is a unit-level scenario against the grammar function itself, per the plan's explicit instruction ("`describeChange` will need exporting from `services/docs.ts` for testability"). No logic changed; `git diff` on this file shows only the `export` keyword added, nothing else.

## Not written

None — all four assigned scenarios (TS-2, TS-3, TS-11, TS-12) are covered.

## Prerequisites needed

- **TS-12's mutation cannot be proven in the working tree.** `apps/server/prisma/schema.prisma` and `apps/server/prisma/migrations/**` are both under `boundaries.never_modify` for this agent. The proof manifest still names the mutation (`onDelete: Cascade` → `onDelete: Restrict` on `DocDraft`'s `doc` relation) per the plan's own note ("Proving this red requires a scratch worktree") — but making it actually bite requires the proving step to run in an isolated worktree, regenerate the Prisma client (or otherwise get Postgres to enforce the new constraint), run the test, then discard the worktree. A plain `find`/`replace` on `schema.prisma` alone will not change the live FK behavior against the already-provisioned `:5432` database unless a migration/`db push` runs against that isolated copy.

## Observations

- AC-131 is genuinely disputed (flagged in the plan too): techspec §4 says attribution should come from the Yjs update's client-id, but `saveDoc`/`describeChange` derive the copy from a line-count delta instead (basis U-7, unresolved). TS-11 deliberately only asserts the singular/plural grammar, which is true regardless of which mechanism wins that question — I did not encode the disputed mechanism. Handing this to whoever owns U-7 to resolve; not a bug I fixed or worked around.
- `describeChange`'s "no line-count change" branch always returns the literal string `"edited this document"` regardless of whether the text changed at all (even a whitespace-only edit that doesn't cross a `\n` boundary hits this same branch as a genuine no-op save). Not in scope for TS-11 (which only asserts grammatical number), but worth a look if a future AC ever wants "no changes" to read differently from "edited but same line count" — flagging for qa-adversary/qa-triager rather than acting on it myself.
