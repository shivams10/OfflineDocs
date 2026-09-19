# DocSync

An offline-first collaborative document workspace. Documents you have opened stay fully
editable with no network; a Save made offline is queued and lands on its own when the
connection returns. Changes from different people merge automatically through a CRDT, so
there is no conflict prompt to answer.

Beyond offline editing it has a document dashboard with per-document roles, presence chips,
web push on save, and dictation transcribed by a speech-to-text service that runs on your own
machine.

```
apps/web      Next.js 16 PWA  ·  port 4000
apps/server   Express 5 API   ·  port 3000
apps/stt      FastAPI + faster-whisper  ·  port 8000   (dictation only)
packages/shared   Types both sides import
```

Full specification: `docs/docsync-master-spec.md` — the source of truth for behaviour, and a
record of the decisions behind it.

> **`docs/` is currently in `.gitignore`**, so a fresh clone does not include the spec or the
> design system. Anything below that points at `docs/` assumes a checkout that has them.

## Prerequisites

| | |
|---|---|
| Node | 24 (repo built on 24.18) |
| pnpm | 11 (`packageManager` pins it) |
| Docker | For PostgreSQL |
| Python | 3.12+ — only for dictation |
| Google OAuth credentials | The only way to sign in; there is no local login |

## Setup

```bash
pnpm install
docker compose up -d                     # PostgreSQL on :5432
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter server exec prisma migrate deploy
```

Fill in `apps/server/.env`:

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Matches `docker-compose.yml` as shipped |
| `JWT_SECRET` | Everything | 32+ characters |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Signing in | Redirect URI `http://localhost:3000/auth/google/callback` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Push | All three or none — push stays off rather than half-configured. Generate with `pnpm --filter server exec web-push generate-vapid-keys` |
| `STT_URL` | Dictation | Defaults to `http://127.0.0.1:8000` |

`apps/web/.env.local` needs only `NEXT_PUBLIC_API_ORIGIN` (default `http://localhost:3000`).

## Running it

Two terminals, or three with dictation:

```bash
pnpm --filter server dev     # API   → http://localhost:3000
pnpm --filter web dev        # App   → http://localhost:4000
```

Sign in with a real Google account; your workspace is created on first sign-in. Sharing needs
**two Google accounts**, and an invitee must have signed in at least once or the invite is
rejected.

### Dictation (optional)

```bash
cd apps/stt
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

The first start downloads the model. `WHISPER_MODEL` defaults to `small`; set it to `medium`
for better accuracy at roughly 3× the CPU time. Details, including the error codes it returns,
are in [`apps/stt/README.md`](apps/stt/README.md).

Without it the app works normally and dictation reports that transcription is unavailable.

### Seeing the offline behaviour

**Offline only works in a production build.** `next dev` serves chunks the service worker
cannot cache, so an offline reload fails there even though the worker registers.

```bash
cd apps/web && SW_VERSION=$(git rev-parse --short HEAD) pnpm build && pnpm start
```

Two things worth knowing while testing:

- `SW_VERSION` names the caches. Bump it per build, or a new deploy reuses the previous
  release's cached files — including while you are debugging.
- The **first load after an install is a warm-up**: the shell and document list cache then;
  individual documents cache when you open them.

Then, in DevTools, tick Network → Offline: the dashboard and any document you have opened
still load, Save queues with a **Pending** badge, and the queue flushes by itself on reconnect.

## Tests

```bash
pnpm exec vitest run --project web      # from the repo root
pnpm exec vitest run --project server   # needs PostgreSQL running
```

Always name the project: a bare `vitest run` with `-t` breaks name filtering across the two.

**One web test fails on purpose.** `lib/api/presence.draft-restore.test.tsx` holds open an
unbuilt gap — the server can return a draft backup, but nothing on the client asks for it yet.
`1 failed | 99 passed` is the expected result, not a regression.

End-to-end tests drive a real browser:

```bash
pnpm --filter server seed:e2e    # mints a session per role, ~15 min validity
pnpm exec playwright test
```

## How it fits together

- **Editing** — the document is a Yjs `Y.Doc` persisted to IndexedDB. The server never sees
  keystrokes: an explicit Save posts a Yjs update, which the API merges into the stored
  snapshot inside a transaction. Two people saving divergent offline edits both land.
- **Offline queue** — a Save made offline goes to IndexedDB and is sent by the service worker,
  through Background Sync where it exists and a reconnect message elsewhere. Replay is
  ordered per document, and a failed item blocks only its own document. Nothing queued is ever
  discarded to make room: over budget (50 MB, 25 MB of it for audio), the *new* entry is
  refused and the user is told.
- **Access revoked while queued** — the entry is marked rejected and surfaced with a **Copy
  text** action. Someone else changing a permission must not silently destroy your work.
- **Auth** — Google OAuth only. Both tokens are httpOnly cookies, so an XSS bug cannot
  exfiltrate a credential; a readable CSRF cookie is echoed on every mutation. Roles are
  checked server-side on every request — hiding a control in the UI is presentation, not
  enforcement.
- **Dictation** — the browser records WebM/Opus and posts it to the API, which checks auth,
  role, size and type before forwarding to the local STT service. Audio is never stored: it
  lives in a temp file for one request. A transcript lands in a review panel and reaches the
  document only when the user presses **Insert at cursor**. Recorded offline, it is queued like
  a save and transcribed when the app is next open with a network.

One service worker serves the whole app (`apps/web/public/sw.js`): caching, Background Sync,
and push through `sw-push.js`, which it imports. A scope gets exactly one worker, so anything
that registers a second one silently replaces the first.

## Roles

| | Owner | Editor | Viewer |
|---|---|---|---|
| Read, presence, push | ✅ | ✅ | ✅ |
| Edit, save, dictate | ✅ | ✅ | ❌ |
| Rename, delete, share | ✅ | ❌ | ❌ |

A viewer sees no editing surface, no Save and no Dictate button — hidden entirely, not
disabled. A non-collaborator gets `404` rather than `403`, so status codes cannot be used to
discover which documents exist.

## API

All routes need a session; mutations need the CSRF header. Doc-scoped routes answer `404` when
you are not a collaborator and `403` when your role is too low.

| Method | Path | Role |
|---|---|---|
| `GET` | `/auth/me` · `POST /auth/refresh` · `POST /auth/logout` | authed |
| `GET` `POST` | `/docs` | authed |
| `GET` | `/docs/:id` | viewer |
| `PATCH` `DELETE` | `/docs/:id` | owner |
| `POST` | `/docs/:id/save` | editor |
| `POST` | `/docs/:id/duplicate` | viewer |
| `GET` `POST` `PATCH` `DELETE` | `/docs/:id/collaborators…` | editor to read, owner to change |
| `GET` `POST` | `/docs/:id/draft` · `GET /docs/:id/presence` | viewer |
| `POST` | `/docs/:id/transcribe` | editor |
| `GET` `POST` `DELETE` | `/push/…` | authed |

## What is not built

Phases 0–4 are complete; Phase 5 (polish and integration) has not started. Deliberate gaps,
listed in full in the spec's §18.2:

- **Pending invites.** Inviting an email with no DocSync account returns `404`. The table
  exists and is unused.
- **Owner as an assignable role**, and so ownership transfer.
- **Draft restore on the client** — the endpoint works; nothing calls it.
- **Version history** — snapshot per save only, no restore UI.
- **"Anyone with the link" access** — rendered disabled on purpose.
- Offline, a document you have **never opened** shows the "not available offline" page rather
  than the in-app load error.

## Conventions

- Server layering is strict: `routes` → `controllers` → `services`, with zod schemas in
  `validators`. Business logic lives in services.
- No user-facing copy inline in components — it belongs in `constants/labels.ts` and
  `constants/errors.ts`.
- No colour literals in components. Semantic tokens only, per `docs/DESIGN_SYSTEM.md`;
  `globals.css` holds every hex.
- Every response wraps its payload under a named key (`{ doc }`, `{ docs }`), never a bare
  array.
