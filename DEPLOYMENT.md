# Deploying DocSync for a demo (AWS Free Plan)

DocSync runs on a single AWS EC2 VM (`m7i-flex.large`) under Docker Compose. Caddy serves the
web app at `https://docsync-demo.duckdns.org` and the API at
`https://docsync-demo.duckdns.org:8443`. No application code changes are needed, and all of it
runs there, dictation included.

`docsync-demo.duckdns.org` stands for **your** hostname throughout. Replace it everywhere with
the name you pick in [Step 4](#step-4--free-hostname-with-duckdns).

- [Overview](#overview)
- [Before you start](#before-you-start)
- [Step 1 — Budget alert and region](#step-1--budget-alert-and-region)
- [Step 2 — Launch the EC2 instance](#step-2--launch-the-ec2-instance)
- [Step 3 — Fixed IP (Elastic IP)](#step-3--fixed-ip-elastic-ip)
- [Step 4 — Free hostname with DuckDNS](#step-4--free-hostname-with-duckdns)
- [Step 5 — Google OAuth for the demo URLs](#step-5--google-oauth-for-the-demo-urls)
- [Step 6 — Prepare the VM](#step-6--prepare-the-vm)
- [Step 7 — Deployment files](#step-7--deployment-files)
- [Step 8 — Production environment and secrets](#step-8--production-environment-and-secrets)
- [Step 9 — Build, migrate, start](#step-9--build-migrate-start)
- [Step 10 — Smoke test](#step-10--smoke-test)
- [Day-to-day operation](#day-to-day-operation)
- [Troubleshooting](#troubleshooting)
- [Teardown](#teardown)

---

## Overview

```mermaid
flowchart LR
  B[Browser] -- "https :443" --> C[Caddy]
  B -- "https :8443" --> C
  C -- ":4000" --> W[web<br/>Next.js]
  C -- ":3000" --> S[server<br/>Express API]
  S --> P[(postgres)]
  S -- "http :8000<br/>internal only" --> T[stt<br/>faster-whisper]
```

| Container | What it is | Port | Reachable from the internet |
|---|---|---|---|
| `caddy` | Reverse proxy; gets and renews HTTPS certificates automatically | 80, 443, 8443 | Yes |
| `web` | Next.js production build (`next start`) | 4000 | No, only through Caddy |
| `server` | Express API (`node dist/index.js`) | 3000 | No, only through Caddy |
| `postgres` | PostgreSQL 16 | 5432 | No |
| `stt` | FastAPI + faster-whisper dictation service | 8000 | No, the API calls it internally |

### Why one hostname on two ports

Two things in the code decide it:

- **The web app reads a cookie the API sets.** The API sets `docsync_csrf`
  (`apps/server/src/lib/cookies.ts`) without a `Domain` attribute, and
  `apps/web/lib/api/client.ts` reads it with `document.cookie`. Cookies ignore ports, so
  one hostname on two ports shares that cookie. Two different hostnames (for example
  Vercel plus Render) would not, and every save would fail with `403 csrf_token_invalid`.
- **The service worker expects the API on a separate origin.** `apps/web/public/sw.js`
  treats every request to the API's origin as an API call. If the web app and API shared one
  origin behind a path router, it would stop caching the app shell and offline mode would
  break. A different port is a different origin, so it keeps working.

HTTPS is required, not optional. Browsers only allow service workers, web push and
microphone access (dictation) on secure origins.

---

## Before you start

Plan on about 2 hours for a first deployment. After that, redeploying takes about 10 minutes.

**You need:**

- **An AWS account on the Free Plan**, created on or after 15 July 2025. Only those accounts
  can launch `m7i-flex.large`
  ([eligible types](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.md)).
- **A Google Cloud project** with an OAuth client. Google sign-in is the app's only login.
- **Two Google accounts** to demo sharing. An invitee must have signed in once before they can
  be invited.
- **A terminal with `ssh`** on your Mac.
- **The repo on GitHub.** The VM clones `https://github.com/shivams10/OfflineDocs.git`. If the repo
  is private, you also need a GitHub personal access token.

**What it costs.** The Free Plan gives
[$100–200 in credits](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/).
Everything below is paid from those credits, not from your card:

| Item | Approximate cost | When it's charged |
|---|---|---|
| `m7i-flex.large` instance | ~$0.10 per hour (~$70 per month if it runs 24/7) | Only while the instance is running |
| 30 GB gp3 disk | ~$2.40 per month | Always, until you delete it |
| Elastic IP (public IPv4) | ~$0.005 per hour (~$3.60 per month) | Always, until you release it, even while the instance is stopped |

These are us-east-1 figures, so check the
[EC2 pricing page](https://aws.amazon.com/ec2/pricing/on-demand/) for your region.
**Stopping the instance between demos is what makes the credits last**: stopped, it costs
only about $6 a month.

The Free Plan ends after 6 months or when the credits run out, whichever comes first. AWS then
closes the account unless you upgrade it. Treat this setup as demo-only, and keep nothing on it
that isn't also in git.

---

## Step 1 — Budget alert and region

Set up a budget alert first, so a forgotten running instance emails you before it uses up the
credits.

1. Sign in to the AWS Console.
2. Open **Billing and Cost Management → Budgets → Create budget**.
3. Choose **Use a template → Monthly cost budget**.
4. Set the budgeted amount to **$20** and enter your email address.
5. Click **Create budget**. AWS emails you at 85% and 100% of $20, and again if it forecasts
   you'll go over.

**Pick a region** in the region selector at the top right of the console, and use it for every
step below. Choose the region closest to your demo audience, for example **Asia Pacific
(Mumbai) `ap-south-1`**.

EC2 instances, Elastic IPs and security groups all belong to a region. If the instance seems
to have disappeared, check the region selector first.

---

## Step 2 — Launch the EC2 instance

The instance is an Ubuntu 24.04 `m7i-flex.large` (2 vCPU, 8 GB RAM, x86) with a 30 GB disk.
8 GB fits all five containers, with room left over for Whisper.

Open **EC2 → Instances → Launch instances**, then fill in the form top to bottom:

1. **Name:** `docsync-demo`.
2. **Application and OS Images (AMI):** choose **Ubuntu Server 24.04 LTS**, architecture
   **64-bit (x86)**. Pick x86, not Arm, because `m7i-flex` is an Intel instance.
3. **Instance type:** `m7i-flex.large`.
4. **Key pair (login):** click **Create new key pair**, name it `docsync-demo`, choose type
   **ED25519** and format **.pem**. The browser downloads `docsync-demo.pem`.
   **This is the only copy.** Without it you can't SSH into the VM. Move it into place and
   lock it down:

   ```bash
   mkdir -p ~/.ssh
   mv ~/Downloads/docsync-demo.pem ~/.ssh/
   chmod 400 ~/.ssh/docsync-demo.pem   # ssh refuses keys that others can read
   ```

5. **Network settings:** click **Edit**. Keep the default VPC and subnet, and set
   **Auto-assign public IP: Enable**. Choose **Create security group**, name it
   `docsync-demo-sg`, and add these inbound rules:

   | Type | Port | Source | Why |
   |---|---|---|---|
   | SSH | 22 | **My IP** | Only your current IP address can SSH in |
   | HTTP | 80 | Anywhere (0.0.0.0/0) | Caddy's certificate challenge, and redirects to HTTPS |
   | HTTPS | 443 | Anywhere (0.0.0.0/0) | The web app |
   | Custom TCP | 8443 | Anywhere (0.0.0.0/0) | The API |

   Don't open 3000, 4000, 5432 or 8000. Those services are only reachable inside Docker's
   network, and that's what keeps Postgres and STT private.

6. **Configure storage:** **30 GiB**, volume type **gp3**. Docker images and the Whisper model
   need about 10 GB, and the default 8 GB would fill up during the first build.
7. Click **Launch instance**, then **View all instances**. Wait until **Instance state** says
   *Running* and **Status check** says *2/2 checks passed* (1–2 minutes).

---

## Step 3 — Fixed IP (Elastic IP)

An Elastic IP keeps the VM's public address the same when you stop and start it. Without one,
AWS assigns a new IP on every start, and you'd have to update DNS each time.

1. Open **EC2 → Network & Security → Elastic IPs → Allocate Elastic IP address**. Keep the
   defaults and click **Allocate**.
2. Select the new address, then choose **Actions → Associate Elastic IP address**.
3. **Resource type:** Instance. **Instance:** `docsync-demo`. Click **Associate**.
4. Copy the address, for example `13.234.56.78`. It's referred to as `<ELASTIC_IP>` below.

Check that you can reach the VM from your Mac:

```bash
ssh -i ~/.ssh/docsync-demo.pem ubuntu@<ELASTIC_IP>
```

Type `yes` at the fingerprint prompt. You should get an `ubuntu@ip-…:~$` prompt. Type `exit` to
leave.

---

## Step 4 — Free hostname with DuckDNS

DuckDNS gives you a free hostname like `docsync-demo.duckdns.org` that points at your Elastic IP.
You need a hostname because Let's Encrypt won't issue certificates for bare IP addresses, and
Google OAuth doesn't accept them as redirect URIs.

1. Go to [duckdns.org](https://www.duckdns.org) and sign in with GitHub or Google.
2. Under **sub domain**, type a name, for example `docsync-demo`, and click **add domain**.
3. In the **current ip** field for that row, paste `<ELASTIC_IP>` and click **update ip**.
4. Check that it resolves (DNS can take a minute):

   ```bash
   dig +short docsync-demo.duckdns.org   # should print <ELASTIC_IP>
   ```

**If you already own a domain**, you can use it instead: create an `A` record such as
`demo.yourdomain.com` pointing at `<ELASTIC_IP>`. Everything else stays the same.

---

## Step 5 — Google OAuth for the demo URLs

Google sends users back to exactly `SERVER_ORIGIN + /auth/google/callback` (see
`apps/server/src/services/oauth/google.ts`). The demo URL must be registered exactly, port
included, or sign-in fails with `redirect_uri_mismatch`.

Open [Google Cloud Console](https://console.cloud.google.com) and select the project you already
use for local development. You can reuse its OAuth client and add the demo URLs next to the
localhost ones.

1. **APIs & Services → OAuth consent screen** (called **Google Auth Platform** in newer
   consoles):
   - **Publishing status:** leave it on **Testing**. You don't need Google's verification
     review for a demo.
   - **Audience → Test users → Add users:** add every Google account that will sign in during
     the demo, both of your sharing accounts included. In Testing mode, only listed test users
     can sign in. Anyone else sees "Access blocked".
   - **Branding → Authorized domains:** if the console asks for one, add
     `docsync-demo.duckdns.org`.
2. **APIs & Services → Credentials** → open your **OAuth 2.0 Client ID** (type *Web application*):
   - **Authorized JavaScript origins:** add `https://docsync-demo.duckdns.org`
   - **Authorized redirect URIs:** add `https://docsync-demo.duckdns.org:8443/auth/google/callback`
   - Click **Save**. The change can take up to 5 minutes to apply.
3. Copy the **Client ID** and **Client secret**. They go into the server's environment in
   [Step 8](#step-8--production-environment-and-secrets).

If Google rejects the `duckdns.org` domain, use a cheap real domain instead
([Step 4](#step-4--free-hostname-with-duckdns), last paragraph), then register that URL here.

---

## Step 6 — Prepare the VM

On the VM you install Docker, add swap as a safety margin, and clone the repo. Run all of this
over SSH:

```bash
ssh -i ~/.ssh/docsync-demo.pem ubuntu@<ELASTIC_IP>
```

### 6.1 Update the OS

A fresh AMI is usually weeks behind on security patches.

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

If it asks about restarting services, accept the defaults. If it says a reboot is required, run
`sudo reboot`, wait 30 seconds, and SSH in again.

### 6.2 Install Docker Engine and the Compose plugin

This is Docker's official convenience script. It adds Docker's apt repository and installs
`docker-ce`, `docker-compose-plugin` and `docker-buildx-plugin`. Docker then starts
automatically on every boot.

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu   # lets you run docker without sudo
exit                             # log out so the new group applies
```

SSH in again, then check it works:

```bash
docker run --rm hello-world      # prints "Hello from Docker!"
docker compose version           # prints v2.x
```

### 6.3 Add 2 GB of swap

The `next build` step and loading the Whisper model both spike memory usage. Swap stops a spike
from killing the build with an out-of-memory error (exit code 137). It's slow, but it's only a
safety net.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # keep it after reboot
free -h                                                        # Swap row should show 2.0Gi
```

### 6.4 Clone the repo

```bash
cd ~
git clone https://github.com/shivams10/OfflineDocs.git
cd OfflineDocs
```

If the repo is private, git asks for a username and password. Enter your GitHub username, and
use a [fine-grained personal access token](https://github.com/settings/personal-access-tokens)
with read-only **Contents** access as the password.

### 6.5 What isn't in the clone

`.gitignore` excludes `.env` files, `node_modules`, `dist`, `docs/` and the generated Prisma
client (`apps/server/src/generated/prisma`), so none of those come across:

- The images build `node_modules`, `dist` and the Prisma client themselves
  ([Step 7](#step-7--deployment-files)).
- You create the environment files on the VM
  ([Step 8](#step-8--production-environment-and-secrets)).
- Never copy your local `.env` files to the VM. The demo gets its own secrets.

---

## Step 7 — Deployment files

The repo has no production container setup yet. Add the seven files below **on your Mac**. Commit
and push them, then run `git pull` on the VM.

| File | Purpose |
|---|---|
| `.dockerignore` | Keeps local junk and secrets out of the web and server images |
| `apps/server/Dockerfile` | Builds the API image |
| `apps/web/Dockerfile` | Builds the web image, with the API origin baked in at build time |
| `apps/stt/Dockerfile` | Builds the dictation image |
| `docker-compose.prod.yml` | Wires the five containers together |
| `Caddyfile` | HTTPS and routing: port 443 → web, port 8443 → API |
| `deploy.sh` | One command to pull, build, migrate and restart |

### 7.1 `.dockerignore` (repo root)

The server and web images build from the repo root because they're pnpm workspace members: they
need the root lockfile and `packages/shared`. This file keeps the build context small, and it
stops a stray `.env` from being baked into an image. Next.js would read `apps/web/.env.local` at
build time, and the server's `dotenv` would load `apps/server/.env` at runtime.

```gitignore
**/node_modules
**/.next
**/dist
**/.env
**/.env.*
!**/.env.example
**/*.tsbuildinfo
apps/server/src/generated
apps/stt
.git
.qa
e2e
.playwright-mcp
docs
```

### 7.2 `apps/server/Dockerfile`

```dockerfile
FROM node:24-bookworm-slim

# Prisma's migration engine needs OpenSSL; slim images ship without it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.20.0

WORKDIR /repo
COPY . .

# The whole workspace, dev dependencies included: `tsc` also compiles the
# test files (they import vitest from the root), and the Prisma CLI must be
# present to run `migrate deploy` from this image.
RUN pnpm install --frozen-lockfile

# The generated client is gitignored, so it's built here. prisma7.config.ts
# reads DATABASE_URL; generate never connects, so a placeholder is enough.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter server exec prisma generate
RUN pnpm --filter server build

WORKDIR /repo/apps/server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

What each part does:

- **`node:24`** matches the Node version the repo is built on (24.18). **`pnpm@11.20.0`** matches the
  version pinned in each package's `devEngines`.
- **`--frozen-lockfile`** installs exactly what `pnpm-lock.yaml` says, and fails instead of
  quietly resolving new versions.
- **`prisma generate`** writes the client into `src/generated/prisma`. Then **`tsc`** compiles
  it, with the rest of `src`, into `dist`.
- **`@docsync/shared`** is imported only as types on the server, so the compiled JavaScript
  doesn't need it at runtime.
- **`NODE_ENV=production`** turns on the `Secure` flag for every cookie
  (`apps/server/src/lib/cookies.ts`). It's required over HTTPS.

### 7.3 `apps/web/Dockerfile`

```dockerfile
FROM node:24-bookworm-slim

RUN npm install -g pnpm@11.20.0

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# Both are read at BUILD time, not at runtime:
#  - NEXT_PUBLIC_* is inlined into the browser bundle by `next build`.
#  - SW_VERSION names the service worker's caches (next.config.ts). A new
#    value per deploy retires the previous release's cached files.
ARG NEXT_PUBLIC_API_ORIGIN
ARG SW_VERSION
ENV NEXT_PUBLIC_API_ORIGIN=${NEXT_PUBLIC_API_ORIGIN} \
    SW_VERSION=${SW_VERSION}

RUN pnpm --filter web build

WORKDIR /repo/apps/web
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "start"]
```

- **The API origin is baked into the build.** Changing `NEXT_PUBLIC_API_ORIGIN` later means
  rebuilding the image. Restarting the container isn't enough.
- **The service worker gets its config from the same build.** `use-service-worker.ts` registers
  `/sw.js?v=<SW_VERSION>&api=<NEXT_PUBLIC_API_ORIGIN>`, so both values reach the worker too.
- **`pnpm start`** runs `next start -p 4000` (`apps/web/package.json`), which listens on all
  interfaces inside the container.

### 7.4 `apps/stt/Dockerfile`

This image builds from `apps/stt` alone. It has no workspace dependencies.

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

# faster-whisper downloads the model through huggingface_hub, which caches
# under HF_HOME. Compose mounts a volume here so it downloads once, not on
# every container start.
ENV HF_HOME=/models

EXPOSE 8000
# 0.0.0.0 so the server container can reach it over Docker's network. It is
# still private: compose publishes no port for this service.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`faster-whisper` decodes audio through PyAV, whose wheels bundle FFmpeg, so you don't need to
install `ffmpeg` with apt.

### 7.5 `docker-compose.prod.yml` (repo root)

The existing `docker-compose.yml` is for local development: it only runs Postgres and publishes
it on `:5432`. This is a separate file, so local development stays as it is.

```yaml
name: docsync

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: docsync
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in the root .env}
      POSTGRES_DB: docsync
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # No `ports:` — Postgres is reachable only by other containers.
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U docsync -d docsync"]
      interval: 5s
      timeout: 5s
      retries: 10

  stt:
    build: ./apps/stt
    restart: unless-stopped
    environment:
      WHISPER_MODEL: small
    volumes:
      - whisper_models:/models

  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    restart: unless-stopped
    env_file: apps/server/.env
    depends_on:
      postgres:
        condition: service_healthy
      stt:
        condition: service_started

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_ORIGIN: https://${DOMAIN:?set DOMAIN in the root .env}:8443
        SW_VERSION: ${SW_VERSION:-manual}
    restart: unless-stopped
    depends_on:
      - server

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8443:8443"
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data        # certificates: keep them, or Let's Encrypt rate-limits you
      - caddy_config:/config
    depends_on:
      - web
      - server

volumes:
  postgres_data:
  whisper_models:
  caddy_data:
  caddy_config:
```

- **`${DOMAIN}` and `${POSTGRES_PASSWORD}`** come from a `.env` file at the repo root.
  Compose reads it automatically for `${…}` substitution (Step 8.1).
- **`env_file: apps/server/.env`** passes the server's variables into its container (Step
  8.2). The file is gitignored, and `.dockerignore` keeps it out of the image.
- **`restart: unless-stopped`** brings every container back after a reboot or an instance
  stop and start, with no extra steps.
- **Only Caddy publishes ports.** Everything else talks over Compose's private network by
  service name (`postgres`, `stt`, `server`, `web`).

### 7.6 `Caddyfile` (repo root)

```caddyfile
# Web app on the standard HTTPS port.
{$DOMAIN} {
	encode zstd gzip
	reverse_proxy web:4000
}

# API on the same hostname, different port: shares cookies with the web app
# (cookies ignore ports) while staying a separate origin for the service worker.
{$DOMAIN}:8443 {
	encode zstd gzip
	reverse_proxy server:3000
}
```

On first start, Caddy asks Let's Encrypt for a certificate for `{$DOMAIN}`, proving ownership
over ports 80 and 443. It serves the same certificate on 8443 and renews it automatically.
Caddy also redirects `http://` to `https://`.

### 7.7 `deploy.sh` (repo root)

```bash
#!/usr/bin/env bash
# Pull, build, migrate, restart. Run on the VM from the repo root.
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml"

git pull --ff-only

# A new cache name per commit, so browsers drop the previous release's files.
export SW_VERSION="$(git rev-parse --short HEAD)"

$COMPOSE build
$COMPOSE up -d postgres
$COMPOSE run --rm server pnpm exec prisma migrate deploy
$COMPOSE up -d

$COMPOSE ps
```

Make it executable before you commit it: `chmod +x deploy.sh`.

- **`migrate deploy`** applies only the migrations committed in `apps/server/prisma/migrations`,
  and it never resets data. It runs from `apps/server`, the image's working directory, where
  Prisma finds `prisma7.config.ts` on its own.
- **`run --rm server`** runs a one-off container that exits and is removed. It waits for
  Postgres to be healthy first, because of `depends_on`.

---

## Step 8 — Production environment and secrets

The demo gets its own secrets, generated on the VM. Both files below are gitignored by the
existing `.env` rule, so they can't be committed by mistake.

### 8.1 Root `.env` (for Compose)

Generate a database password. Hex characters need no escaping inside a connection URL.

```bash
cd ~/OfflineDocs
openssl rand -hex 24          # copy the output: this is <POSTGRES_PASSWORD>
```

```bash
cat > .env <<'EOF'
DOMAIN=docsync-demo.duckdns.org
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
EOF
chmod 600 .env
```

### 8.2 `apps/server/.env` (for the API)

Generate the JWT secret and the web-push keys:

```bash
openssl rand -base64 48                                       # <JWT_SECRET>, 64 chars (≥ 32 required)
docker run --rm node:24-slim npx -y web-push generate-vapid-keys   # <VAPID_PUBLIC_KEY> and <VAPID_PRIVATE_KEY>
```

Then write the file:

```bash
cat > apps/server/.env <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://docsync:<POSTGRES_PASSWORD>@postgres:5432/docsync?schema=public
SERVER_ORIGIN=https://docsync-demo.duckdns.org:8443
WEB_ORIGIN=https://docsync-demo.duckdns.org
JWT_SECRET=<JWT_SECRET>
GOOGLE_CLIENT_ID=<from Step 5>
GOOGLE_CLIENT_SECRET=<from Step 5>
VAPID_PUBLIC_KEY=<VAPID_PUBLIC_KEY>
VAPID_PRIVATE_KEY=<VAPID_PRIVATE_KEY>
VAPID_SUBJECT=mailto:<your email>
STT_URL=http://stt:8000
EOF
chmod 600 apps/server/.env
```

`apps/server/src/config/env.ts` validates these on startup, and the server refuses to start if
any is wrong:

| Variable | Value | Why it matters |
|---|---|---|
| `DATABASE_URL` | Host `postgres`, the Compose service name, **not** `localhost` | Inside a container, `localhost` is the container itself |
| `SERVER_ORIGIN` | `https://…:8443`, no trailing slash | Builds the Google redirect URI; must match Step 5 exactly |
| `WEB_ORIGIN` | `https://…`, no trailing slash | The only origin CORS allows, and where sign-in redirects back to |
| `JWT_SECRET` | 32+ random characters | Signs sessions; a new value logs everyone out |
| `VAPID_*` | All three, or none | With any one missing, push stays off |
| `STT_URL` | `http://stt:8000` | The STT container, over Compose's private network |

`NEXT_PUBLIC_API_ORIGIN` for the web app isn't set here. `docker-compose.prod.yml` builds it
from `DOMAIN` (`https://${DOMAIN}:8443`), so the two can't drift apart.

---

## Step 9 — Build, migrate, start

After you've pushed the Step 7 files from your Mac, run this on the VM:

```bash
cd ~/OfflineDocs
./deploy.sh
```

- **The first run takes 10–15 minutes**, mostly `pnpm install` and `next build` in two images.
  Later runs reuse cached layers.
- **The first STT start downloads the Whisper model** into the `whisper_models` volume. Until it
  finishes, dictation reports that transcription is unavailable.

Check that everything is up:

```bash
alias dc='docker compose -f docker-compose.prod.yml'   # add to ~/.bashrc to keep it

dc ps                           # all five "running"; postgres "healthy"
dc logs caddy | grep -i certificate   # "certificate obtained successfully"
curl https://docsync-demo.duckdns.org:8443/health    # the API answers
curl -I https://docsync-demo.duckdns.org             # HTTP/2 200 from the web app
```

Now open `https://docsync-demo.duckdns.org` in a browser. The padlock should show a valid
certificate.

---

## Step 10 — Smoke test

Run through this list once after every deploy, and again shortly before the demo. It covers
each feature that depends on the deployment being wired correctly.

- [ ] **Sign in** with Google account A. You land on the dashboard, and your workspace is created
      on first sign-in.
- [ ] **Create a document**, type in it, click Save, and reload. The text is still there.
- [ ] **Sign in with account B** in a separate browser profile or incognito window. Do this
      before sharing, because an invitee must have signed in once.
- [ ] **Share** the document from A to B. B sees it on their dashboard.
- [ ] **Presence:** open the document in both windows. Each window shows the other person's chip
      within about 15 seconds.
- [ ] **Merge:** edit different parts in both windows and save in both. Both edits survive,
      with no conflict prompt.
- [ ] **Offline:** open DevTools → Network → **Offline**. Reload: the dashboard and the opened
      document still load. Edit and Save: a **Pending** badge appears. Switch back to Online:
      the save goes through by itself.
- [ ] **Push:** allow notifications in B's window. Save in A. B gets a notification.
- [ ] **Dictation:** allow the microphone, dictate a sentence, and the transcript lands in the
      document.

**Before the demo itself:** sign in with every demo account once, and open every document you
plan to show. The first load after an install only warms the cache. Offline mode works only
for documents that have been opened before.

---

## Day-to-day operation

### Stop the instance between demos (saves credits)

In the console, go to **EC2 → Instances → `docsync-demo` → Instance state → Stop**. To bring it
back, choose **Start**. The Elastic IP, the disk and every Docker volume survive a stop. Docker
starts on boot, and `restart: unless-stopped` brings every container back up, so nothing needs
to be run by hand. Give it about 2 minutes after the instance shows *Running*.

**Don't choose Terminate.** It deletes the disk, and your database with it.

### Redeploy after a code change

Push from your Mac, then on the VM:

```bash
cd ~/OfflineDocs && ./deploy.sh
```

Every deploy gets a new `SW_VERSION`, so browsers show the update banner and drop the old
cached files. Only rebuilt images are restarted.

### Logs

```bash
dc logs -f server        # API
dc logs -f web           # Next.js
dc logs -f stt           # dictation
dc logs -f caddy         # TLS and proxy
dc logs --since 10m      # everything, last 10 minutes
```

### Database backup and restore

```bash
dc exec -T postgres pg_dump -U docsync docsync > ~/backup-$(date +%F).sql        # backup
dc exec -T postgres psql -U docsync docsync < ~/backup-2026-10-01.sql            # restore
```

Copy a backup to your Mac with
`scp -i ~/.ssh/docsync-demo.pem ubuntu@<ELASTIC_IP>:~/backup-*.sql .`

### Shell into a container

```bash
dc exec server sh
dc exec postgres psql -U docsync docsync
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ssh` times out | Your IP address changed since the SSH rule was set | **EC2 → Security Groups → `docsync-demo-sg` → Edit inbound rules**, set the SSH source to **My IP** again |
| Browser shows a certificate error; Caddy logs `challenge failed` | Port 80 or 443 isn't open, or DuckDNS points at the wrong IP | Check the security group (Step 2) and `dig +short <domain>` (Step 4). Then `dc restart caddy` |
| Google: `Error 400: redirect_uri_mismatch` | The redirect URI in Google doesn't exactly match `SERVER_ORIGIN/auth/google/callback` | Compare them character for character: `https`, `:8443`, no trailing slash. Wait 5 minutes after saving |
| Google: "Access blocked: … has not completed the Google verification process" | That account isn't a test user | Add it under **OAuth consent screen → Test users** (Step 5) |
| Sign-in completes but you land back on the login page | `WEB_ORIGIN` or `DOMAIN` differs from the URL in the address bar | Fix the value in `.env` or `apps/server/.env`, then run `./deploy.sh`. The web image must be rebuilt, because the API origin is baked in at build time |
| Browser console: CORS error on API calls | `WEB_ORIGIN` isn't exactly the web app's origin | Set `WEB_ORIGIN=https://<domain>`, with no port and no trailing slash, then run `dc up -d server` |
| Save fails with `403 csrf_token_invalid` | The web app and API are on different hostnames, so the CSRF cookie isn't readable | Both must use the same `DOMAIN`, and only the port may differ (see [Overview](#why-one-hostname-on-two-ports)) |
| `server` keeps restarting; logs show `Invalid environment configuration` | A variable in `apps/server/.env` is missing or malformed | The log line names the variable. Fix it, then run `dc up -d server` |
| Build stops with exit code `137` | Out of memory during `pnpm install` or `next build` | Check swap exists (`free -h`, Step 6.3), then run `./deploy.sh` again |
| Dictation says transcription is unavailable | The STT container is still downloading the model, or it crashed | `dc logs stt`. If it says `libgomp.so.1: cannot open shared object file`, add `RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*` to `apps/stt/Dockerfile` before `pip install` |
| Offline reload shows the offline page instead of the document | That document was never opened while online, or the cache is from an older build | Open the document online once. After a redeploy, accept the update banner |
| Nothing loads on the demo network, but it works on mobile data | That network blocks outbound port 8443 (common on corporate Wi-Fi) | Use a phone hotspot for the demo. The permanent fix is subdomains on port 443 (`app.` and `api.`), which needs a `COOKIE_DOMAIN` change in `apps/server/src/lib/cookies.ts` |

---

## Teardown

When the demo is over, remove everything, because AWS keeps charging for some of these even
while the instance is stopped.

1. **Back up anything you want to keep** (see [Database backup](#database-backup-and-restore))
   and copy it to your Mac.
2. **EC2 → Instances → `docsync-demo` → Instance state → Terminate.** This also deletes the
   30 GB disk, because "Delete on termination" is on by default for the root volume.
3. **EC2 → Elastic IPs →** select the address → **Actions → Release Elastic IP address.** An
   unattached Elastic IP is still billed.
4. **EC2 → Security Groups →** delete `docsync-demo-sg`.
5. **EC2 → Key Pairs →** delete `docsync-demo`, and delete `~/.ssh/docsync-demo.pem` on your Mac.
6. **Google Cloud Console → Credentials →** remove the demo JavaScript origin and redirect URI.
7. **DuckDNS →** delete the subdomain.
8. **Billing → Budgets →** keep the alert until the next bill confirms that the charges have
   stopped.
