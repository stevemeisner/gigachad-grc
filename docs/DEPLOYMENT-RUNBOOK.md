# Deployment Runbook

A numbered, start-to-finish procedure for putting GigaChad GRC into production
on a single server. Written for someone who has never deployed this
application. Every command, file, environment variable and endpoint named here
exists in this repository.

Read [Hosting Requirements](./HOSTING-REQUIREMENTS.md) first if you still have
to choose where to host and what it will cost.

**Roughly how long:** two to three hours end to end, most of it waiting for
container builds.

| Step | What you do |
|---|---|
| [1](#1-prerequisites) | Gather accounts and tools |
| [2](#2-create-the-firebase-project) | Create the Firebase project and turn on Google sign-in |
| [3](#3-restrict-who-can-sign-in) | Decide and configure who may sign in |
| [4](#4-provision-the-server) | Provision the VM, Docker, firewall and DNS |
| [5](#5-configure-the-environment) | Fill in `.env.prod` |
| [6](#6-create-the-first-administrator) | Create the first organization and admin row |
| [7](#7-deploy) | Build, start, apply the schema, verify |
| [8](#8-verify-sign-in-end-to-end) | Sign in for real, and recognise each failure |
| [9](#9-day-two-operations) | Users, backups, logs |
| [10](#10-rollback) | Roll back |

---

## 1. Prerequisites

### Accounts

| Account | What it is for | Cost |
|---|---|---|
| **Google account with access to the Firebase console** | Creating the Firebase project that issues sign-in tokens. Use an account in the company's Google Workspace | Free |
| **Google Workspace (or any Google accounts) for your users** | This *is* your user directory. Nobody has to be imported, invited or given a new password — people sign in with the Google account they already use | Already paid for |
| **Domain registrar / DNS control** | One `A` record pointing at the server | Existing |
| **Server or cloud provider account** | The VM in step 4 | ~$28–58/month |

### Tools on the server

| Tool | Why | Check |
|---|---|---|
| **Docker Engine 24+** | Runs everything | `docker --version` |
| **Docker Compose v2 plugin** | `docker compose`, not `docker-compose` | `docker compose version` |
| **git** | To clone this repository onto the server | `git --version` |
| **openssl** | Generates the two secrets in step 5 | `openssl version` |
| **psql** *(optional)* | Only if you prefer it to `docker compose exec postgres psql` | — |

Node.js is **not** required on the server: every build happens inside Docker,
and the one Prisma command in step 7 runs in a throwaway container.

### On your laptop

Access to the [Firebase console](https://console.firebase.google.com/) and SSH
access to the server.

---

## 2. Create the Firebase project

Firebase Authentication is the identity provider. It issues the signed ID
token the browser sends with every API call; the application verifies that
token and then reads the person's role from its own database.

1. Open <https://console.firebase.google.com/> and choose **Add project**.
   Name it something like `acme-grc`. Google Analytics is not used — decline
   it.
2. In the left sidebar choose **Build → Authentication**, then **Get started**.
3. On the **Sign-in method** tab, choose **Google** from the provider list and
   enable it. Set the public-facing project name and a support email, then
   **Save**.
   **Enable nothing else.** The backend rejects any token whose sign-in
   provider is not `google.com`, so an extra provider would only produce
   confusing failures.
4. Still in **Authentication**, open the **Settings** tab → **Authorized
   domains**, and add the hostname the app will be served from, e.g.
   `grc.example.com`. `localhost` is there by default; leave it.

   > **What this list does:** it names the web origins that are allowed to
   > *complete* a sign-in — the anti-phishing check that stops someone else's
   > website from starting a login against your project. It has **nothing** to
   > do with deciding *who* is allowed in. That is step 3.

5. Collect four values. Open **Project settings** (the gear icon) →
   **General**:

   | Value | Where | Environment variable |
   |---|---|---|
   | Project ID | *Your project* → **Project ID** | `FIREBASE_PROJECT_ID` **and** `VITE_FIREBASE_PROJECT_ID` |
   | Web API key | **Your apps** → the web app → **SDK setup and configuration** → `apiKey` | `VITE_FIREBASE_API_KEY` |
   | Auth domain | same panel → `authDomain`, normally `<project-id>.firebaseapp.com` | `VITE_FIREBASE_AUTH_DOMAIN` |

   If **Your apps** is empty, click the web icon (`</>`) to register a web app
   first. You do not need Firebase Hosting; skip that offer.

   > **The Web API key is not a secret.** It is a public client identifier
   > that ships inside the browser bundle by design — anyone can read it from
   > your JavaScript. It grants nothing on its own. Do not treat a leak of it
   > as an incident, and do not try to hide it: `frontend/Dockerfile` bakes it
   > into the build, because the browser needs it before anyone has signed in.

6. **No user import.** Firebase does not need a copy of your staff list.
   Anyone with a Google account can obtain a token from your project; what
   makes them a *user of this application* is step 3.

---

## 3. Restrict who can sign in

This is the part people get wrong, because the Firebase console has no "only
my company" switch that actually works for an API.

**A Firebase ID token does not carry Google's `hd` (hosted domain) claim.**
There is therefore nothing in the token that proves the holder belongs to your
Workspace. Two layers in this application do the real work, and both are
enforced server-side in `services/shared/src/auth/firebase-auth.guard.ts`:

| Layer | Variable | Behaviour |
|---|---|---|
| **Email domain allowlist** | `ALLOWED_EMAIL_DOMAINS` | Comma-separated list, e.g. `example.com,example.co.uk`. The guard compares it against the verified email address's suffix. A mismatch is **403**. Leaving it empty disables the check — never do that in production |
| **A `users` row must exist** | `AUTH_AUTO_PROVISION` (default `false`) | With the default, an address with no matching `users` row is refused with **401**, whatever domain it came from. This is the layer that means "you have to be given an account", not merely "you work here" |

Notes that matter:

- The guard lowercases each entry and strips a leading `@`, so
  `@Example.com` and `example.com` behave identically.
- It also requires `email_verified` to be true and the sign-in provider to be
  `google.com`, so consumer accounts with unverified addresses are rejected
  before either layer above.
- `VITE_ALLOWED_EMAIL_DOMAIN` (singular, a frontend variable) **restricts
  nothing**. It is passed to Google as the `hd` parameter purely to pre-filter
  the account chooser so people see their work account first. It is a
  convenience, and a determined user can ignore it. Never rely on it.
- If you set `AUTH_AUTO_PROVISION=true` you must also set
  `AUTH_DEFAULT_ORG_ID` to an existing organization's UUID; the guard refuses
  to start otherwise. Everyone in an allowed domain then becomes a `viewer` on
  first sign-in.

**Recommended for a first deployment:** `ALLOWED_EMAIL_DOMAINS` set to your
Workspace domain, `AUTH_AUTO_PROVISION=false`, and rows added deliberately.

---

## 4. Provision the server

One VM runs everything: Traefik, the nginx gateway, the frontend, six API
services, PostgreSQL, MinIO and the backup scheduler.

### Size

| Resource | Minimum | Comfortable |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |

4 GB is enough to *run* the stack — measured idle usage is about 370 MB
(six Node services 148 MB, PostgreSQL 124 MB, MinIO 91 MB). What needs the
headroom is the **first image build**: a Vite production build of this
frontend peaks around 1.5–2.5 GB. If you build images in CI and pull them
instead of running `--build` on the server, 2 GB is workable.

Concrete options (prices read 2026-09-10):

| Option | Machine | Monthly | Trade-off |
|---|---|---|---|
| Minimum | DigitalOcean `s-1vcpu-2gb` | $12 | Must build images in CI; tight |
| **Recommended** | DigitalOcean `s-2vcpu-4gb` | **$24** | Builds on the host, slowly |
| Cheapest equivalent | Hetzner `CX33` (4 vCPU / 8 GB) | ~$10 | EU only; no SOC 2 report |

Add roughly 20% for the provider's automated backups. Note Hetzner's CX line
is far cheaper than the CPX line for the same specification.

Disk is dominated by evidence uploads and **backups**, not images. With the
default retention, local archives will outgrow a small disk — send them
off-box (see section 9).

Ubuntu 22.04 or 24.04 LTS is the least surprising choice.

### Install Docker

Use Docker's own repository, not the distribution package, so you get Compose
v2:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"    # log out and back in
docker compose version             # must print v2.x
```

### Firewall

Open **only** 22, 80 and 443. Nothing else needs to be reachable: PostgreSQL
and the six services are on an internal Docker network with no published
ports, and the gateway is the only thing Traefik routes to.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP - required for Let's Encrypt validation
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

Port 80 must stay open even though the app redirects to HTTPS: Let's Encrypt
validates the certificate over HTTP.

### DNS

Create one `A` record pointing at the server's public IP:

| Name | Type | Value |
|---|---|---|
| `grc` (i.e. `grc.example.com`) | A | your server's IPv4 address |

Wait for it to resolve before step 7 — Traefik cannot obtain a certificate for
a name that does not point at it yet:

```bash
dig +short grc.example.com
```

You do not need any MinIO DNS records. `docker-compose.prod.yml` routes only
`storage.${APP_DOMAIN}` (the S3 API), and evidence uploads go through the API
rather than the browser, so a first deployment needs nothing beyond the main
hostname. MinIO's admin console is deliberately not published: `MINIO_BROWSER`
defaults to `off` and no route exists for it. To reach it deliberately, tunnel
to the container: `ssh -L 9001:localhost:9001 your-server` after temporarily
setting `MINIO_BROWSER=on`.

### Clone the repository

```bash
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc
```

---

## 5. Configure the environment

```bash
cp deploy/env.example .env.prod
chmod 600 .env.prod
```

`.env.prod` is the only environment filename this deployment uses. Every
compose command below passes `--env-file .env.prod` explicitly,
`docker-compose.prod.yml` mounts it into the backup scheduler, and
`deploy/backup.sh`, `deploy/restore.sh`, `deploy/verify-backup.sh` and
`scripts/validate-production.sh` all read it. Nothing looks for `.env`, so
there is no second file and no symlink to keep in step.

Now edit `.env.prod`. These are the variables you must set:

| Variable | What it does | How to get it |
|---|---|---|
| `NODE_ENV` | Runtime mode. Leave it as `production` | Already set |
| `APP_DOMAIN` | The public hostname, no scheme | `grc.example.com` |
| `ACME_EMAIL` | Where Let's Encrypt sends expiry warnings | A monitored mailbox |
| `POSTGRES_USER` | Database user | Keep `grc` |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -base64 32` |
| `POSTGRES_DB` | Database name | Keep `gigachad_grc` |
| `FIREBASE_PROJECT_ID` | Pins the accepted token issuer and audience | Step 2, Project ID |
| `ALLOWED_EMAIL_DOMAINS` | Who may sign in | Your Workspace domain(s), comma-separated |
| `AUTH_AUTO_PROVISION` | Auto-create a `viewer` row on first sign-in | Leave `false` |
| `AUTH_DEFAULT_ORG_ID` | Organization for auto-provisioned users | Only if the above is `true`; the UUID from step 6 |
| `AUTH_MODE` | The demo bypass | **Leave commented out.** See the warning below |
| `VITE_FIREBASE_API_KEY` | Browser Firebase config (build-time) | Step 2, Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Browser Firebase config (build-time) | Step 2, auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Browser Firebase config (build-time) | Same value as `FIREBASE_PROJECT_ID` |
| `VITE_ALLOWED_EMAIL_DOMAIN` | Pre-fills the domain in Google's account chooser (build-time). Cosmetic: it restricts nothing, `ALLOWED_EMAIL_DOMAINS` does | Your Workspace domain |
| `MINIO_ROOT_USER` | Object storage user | Change from `minioadmin` |
| `MINIO_ROOT_PASSWORD` | Object storage password | `openssl rand -base64 32` |
| `MINIO_BROWSER` | MinIO's own web console | Keep `off` in production |
| `ENCRYPTION_KEY` | Encrypts stored integration credentials. **Losing it makes those unreadable** | `openssl rand -hex 32` (must be ≥32 chars) |
| `CORS_ORIGINS` | Browser origins allowed to call the API | `https://grc.example.com` — with the scheme, no trailing slash |
| `LOG_LEVEL` | `info` is right for production | Already set |
| `BACKUP_RETENTION_DAYS` | How long backups are kept | `30` is the shipped default |
| `EMAIL_PROVIDER` | `resend`, `console`, `smtp`, `sendgrid` or `ses` | Ships as `resend`. `npm run validate:production` **fails** on `console` when `NODE_ENV=production`, because notifications are then written to the container log and never sent |
| `EMAIL_FROM` | Sender address for every outgoing email | Required unless the provider is `console`. With `resend` it must be on your verified domain |
| `RESEND_API_KEY` / `SMTP_*` / `SENDGRID_API_KEY` / `AWS_*` | Whichever set the provider above needs | See the comments in `deploy/env.example` |

Every `CHANGE_ME_*` placeholder must be replaced. `npm run validate:production`
fails on any that survive: they are longer than the minimum secret length, so
a copied-but-unedited file would otherwise report its secrets as valid.

Setting up Resend, the shipped provider, in the existing Resend account:

1. Add your sending domain and publish the DNS records Resend gives you.
   Resend sends nothing until the domain shows as verified.
2. Create an API key scoped to that domain and copy it, `re_` prefix
   included.
3. Set `RESEND_API_KEY` to that key and `EMAIL_FROM` to an address on the
   verified domain. A From address on any other domain is rejected on every
   send.

The controls service refuses to start under `NODE_ENV=production` if the
provider you chose is missing a variable it needs, so a typo here stops the
deployment instead of quietly swallowing every notification.

> ⚠️ **Never set `AUTH_MODE=demo` here.** It is the single authentication
> bypass in the system and serves every request as the seeded demo
> administrator. `FirebaseAuthGuard` throws during start-up when it sees
> `AUTH_MODE=demo` together with `NODE_ENV=production`, so the services will
> refuse to boot rather than run unauthenticated — but do not rely on that as
> a safety net.

The four `VITE_*` values are **build-time** inputs: `frontend/Dockerfile`
receives them as build arguments (passed by `docker-compose.prod.yml`) and
Vite compiles them into the JavaScript bundle. Changing one later requires
rebuilding the `frontend` image, not just restarting it.

Check your work before deploying:

```bash
npm run validate:production
```

That script reads `.env.prod` and verifies, among other things, that
`FIREBASE_PROJECT_ID` and `ALLOWED_EMAIL_DOMAINS` are set, that
`VITE_FIREBASE_PROJECT_ID` is equal to `FIREBASE_PROJECT_ID` (a mismatch
otherwise shows up only as a rejected token audience, after a 25–60 minute
image build), that `AUTH_AUTO_PROVISION` has an organization to point at, that
secrets are long enough and not left at a known weak default, that
`AUTH_MODE=demo` is not enabled in production, and that whichever
`EMAIL_PROVIDER` you chose has the settings it actually needs. It then checks
the machine: Docker installed and running, enough memory and disk, and ports
80 and 443 free. (It is a shell script run through npm; run it on your laptop
against the same file if the server has no Node.js.)

> **This is the only readiness check.** `deploy/preflight-check.sh` used to sit
> beside it, duplicating most of these checks while disagreeing about the
> details, so it was deleted and the machine-level checks it alone performed
> were moved into `scripts/validate-production.sh`.

---

## 6. Create the first administrator

**Nothing creates the first account for you.** There is no invite email, no
self-registration and no first-run wizard. Signing in with Google proves who
you are; it does not grant you access. Until a `users` row exists, every
request is rejected with:

```
401  No account is provisioned for you@example.com. Ask an administrator to invite you.
```

You have two ways to create that row. Both end in the same state.

### Option A — pre-create the row (recommended)

You do not need the person's Firebase UID. Insert the row with a placeholder
`external_id`; on their first successful sign-in the guard finds the row by
its verified email address and rewrites `external_id` to their real Firebase
subject. `external_id` is `NOT NULL` and unique, which is why a placeholder is
needed rather than an empty value.

Run this after step 7 has created the schema (the tables must exist first):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U grc -d gigachad_grc <<'SQL'
-- 1. The organization every user and record belongs to.
INSERT INTO organizations (id, name, slug, updated_at)
VALUES (gen_random_uuid(), 'Acme Corporation', 'acme', NOW())
ON CONFLICT (slug) DO NOTHING;

-- 2. The first administrator.
INSERT INTO users (
    id, external_id, email, first_name, last_name, display_name,
    role, status, organization_id, updated_at
)
SELECT
    gen_random_uuid(),
    'pending:jane.doe@example.com',      -- placeholder, replaced on first sign-in
    'jane.doe@example.com',              -- MUST match her Google address exactly
    'Jane', 'Doe', 'Jane Doe',
    'admin', 'active',
    o.id, NOW()
FROM organizations o
WHERE o.slug = 'acme'
ON CONFLICT (external_id) DO NOTHING;

-- 3. Read it back.
SELECT u.email, u.role, u.status, u.external_id, o.name AS organization
FROM users u JOIN organizations o ON o.id = u.organization_id;
SQL
```

This SQL is modelled on `database/dev-bootstrap.sql`, which does the same
thing for the local demo. Both `role` and `status` are set explicitly:
`role` defaults to `viewer` in the Prisma schema, so omitting it would leave
the database describing your administrator as a viewer.

The organization UUID printed by the last query is what goes in
`AUTH_DEFAULT_ORG_ID` if you ever enable auto-provisioning.

### Option B — use the real Firebase UID

If you would rather insert the exact identifier:

1. Ask the person to visit `https://grc.example.com` and sign in with Google
   once. Sign-in succeeds; the app then shows the "not provisioned" error.
   **That failed attempt is the point** — it creates their record in Firebase.
2. In the Firebase console open **Build → Authentication → Users**. Their row
   lists the email address and a **User UID** (a 28-character string). Copy it.
3. Insert as in Option A, but with the real value:

```sql
'kJ8s...their-real-uid...'    -- instead of 'pending:jane.doe@example.com'
```

### Then

Sign-in works immediately — the guard caches a resolved identity for only 30
seconds, so there is nothing to restart. Once Jane is in, she can add everyone
else from **Settings → Users** and **Settings → Permissions** without touching
SQL again (subject to the caveat in
[Hosting Requirements](./HOSTING-REQUIREMENTS.md#still-outstanding) about
needing a Firebase UID for `POST /api/users`).

---

## 7. Deploy

### 7.1 Start the database first

The application images do not create the schema, so PostgreSQL has to be up
before anything else is useful:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
docker compose -f docker-compose.prod.yml --env-file .env.prod ps postgres
```

Wait for `healthy`.

### 7.2 Apply the schema

The schema for all 129 models lives in `services/shared/prisma/schema.prisma`
and is applied with `prisma db push`, which is exactly what
`npm run db:push` runs:

```json
"db:push": "prisma db push --schema=services/shared/prisma/schema.prisma"
```

> **Do not use `prisma migrate deploy`.** This repository ships no baseline
> migration, so there is nothing for it to apply. `deploy/db-migrate.sh` calls
> it and swallows the error — ignore that script.

`docker-compose.prod.yml` publishes no PostgreSQL port (the `grc-network` is
`internal: true`), so run that command from a throwaway container attached to
the same network. Two commands: install dependencies with normal networking,
then push with access to the database.

```bash
# Install once (needs internet, so default networking).
docker run --rm -v "$PWD":/repo -w /repo node:20-alpine npm install

# Find the network name (project prefix + grc-network).
docker network ls | grep grc-network

# Push the schema. Substitute your POSTGRES_PASSWORD.
docker run --rm \
  --network gigachad-grc_grc-network \
  -v "$PWD":/repo -w /repo \
  -e DATABASE_URL="postgresql://grc:YOUR_POSTGRES_PASSWORD@postgres:5432/gigachad_grc" \
  node:20-alpine npm run db:push
```

If you use a managed PostgreSQL that is reachable from the server, skip the
container and run `DATABASE_URL=... npm run db:push` directly.

Confirm the tables exist — one per Prisma model, all in `public`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U grc -d gigachad_grc -c '\dt' | head
```

Now go back and do [step 6](#6-create-the-first-administrator) if you have not
already: the `users` and `organizations` tables exist from this moment.

### 7.3 Build and start everything

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The first build compiles the shared library, the six services and the frontend
bundle. **Expect 25–60 minutes** on a small VM; subsequent builds reuse layers
and take minutes. Watch progress with:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Start-up is ordered by health checks: the six API services wait for PostgreSQL
and MinIO, and the `gateway` waits for the frontend and all six services to
report healthy. If the gateway stays in `created`, one of its dependencies is
unhealthy — that is where to look, not at the gateway.

### 7.4 Verify the deployment

All six services serve the shared health routes (`/health`, `/health/live`,
`/health/ready`) on their own port inside the network — `/health/ready` is the
one that actually touches the database. The controls service additionally
exposes an unauthenticated `GET /api/system/health`, which is reachable
through the public gateway and is therefore the one to probe from outside;
treat it as a liveness ping rather than a dependency check. Its detailed
sibling, `GET /api/system/health/detailed`, needs an authenticated
administrator.

```bash
# From the server, through the public entrypoint:
curl -fsS https://grc.example.com/api/system/health
# {"status":"healthy",...}

# The gateway's own liveness (never proxied to a service):
curl -fsS https://grc.example.com/healthz
# ok

# Per-service, from inside the network:
for s in controls:3001 frameworks:3002 policies:3004 tprm:3005 trust:3006 audit:3007; do
  docker compose -f docker-compose.prod.yml --env-file .env.prod \
    exec -T gateway wget -qO- "http://${s}/health" >/dev/null \
    && echo "$s ok" || echo "$s FAIL"
done
```

Then load `https://grc.example.com` in a browser. You should get a valid
certificate and the sign-in screen with a single **Sign in with Google**
button. There is no "Dev Login" button in a production build: it is compiled
out, because Vite sets `import.meta.env.DEV` to `false`.

---

## 8. Verify sign-in end to end

Sign in as the administrator you created in step 6. Success looks like: the
Google account chooser, then the dashboard, with data loading.

If it does not work, the failure tells you exactly which layer rejected you.
All of these come from `FirebaseAuthGuard`.

| What you see | Status | Cause | Fix |
|---|---|---|---|
| "No account is provisioned for you@example.com" | **401** | The token is valid, but no `users` row matches the token's subject *or* the verified email address, and `AUTH_AUTO_PROVISION` is `false` | Insert the row ([step 6](#6-create-the-first-administrator)). Check for a typo in the email — it must match the Google address exactly |
| "Email domain \"gmail.com\" is not permitted to access this deployment" | **403** | The address is outside `ALLOWED_EMAIL_DOMAINS` | Either sign in with a work account, or add the domain and restart the six services |
| "This account is suspended and cannot be used to sign in" | **403** | The `users` row exists but `status` is not `active` | `UPDATE users SET status = 'active' WHERE email = '…';` |
| "Sign-in provider \"password\" is not accepted. Sign in with Google." | **401** | The token came from a provider other than Google | Only Google sign-in is accepted; check that no other provider is enabled in the Firebase console |
| "Token email address is not verified" | **401** | The Google account has no verified address | Use a Workspace account |
| "Firebase ID token is invalid: jwt audience invalid" | **401** | `FIREBASE_PROJECT_ID` on the server does not match the project the browser bundle was built against | Make `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID` identical, then **rebuild the frontend image** |
| "Firebase ID token has expired" | **401** | Clock skew on the server (tolerance is 60 seconds) | `timedatectl` — enable NTP |
| An unauthorized-domain error from Google, before the app is involved | — | The origin is not in the Firebase **Authorized domains** list | Add `grc.example.com` ([step 2.4](#2-create-the-firebase-project)) |
| The page loads but sign-in does nothing, with a Firebase config error in the browser console | — | The `VITE_FIREBASE_*` build arguments were empty when the frontend image was built | Set them in `.env.prod` and rebuild: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build frontend` |
| Signed in, dashboard loads, but a page shows a permission error | **403** | Authentication succeeded; authorization did not. Permissions come from group grants, then per-user overrides, then a fallback derived from `users.role` | Give the user a role or group in **Settings → Permissions** |

Read the server's own account of it:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 controls
```

A resolved identity is cached for 30 seconds, so a database change can take
that long to be visible.

---

## 9. Day-two operations

### Adding a person

Two systems, two jobs — this is the mental model to keep:

| Where | What it controls |
|---|---|
| **Google admin console** (Workspace) | Whether the person can *log in at all*. Creating, suspending and deleting logins happens here. This application cannot create a Google account |
| **This app: Settings → Users, Settings → Permissions** | What an authenticated person *may do*: role, permission groups, per-user overrides, organization membership, and `status` |

To add someone:

1. Make sure they have a Google account in an allowed domain.
2. Give them a `users` row — from **Settings → Users** if you have their
   Firebase UID, or with the SQL in [step 6](#6-create-the-first-administrator)
   using a placeholder `external_id` if you do not.
3. Assign a role or permission group.

With `AUTH_AUTO_PROVISION=true` steps 2 and 3 collapse into "they sign in and
become a `viewer`, then you promote them".

### Removing a person

Do both, in this order:

1. **In the app:** set their status to inactive (**Settings → Users**), or
   `UPDATE users SET status = 'inactive' WHERE email = '…';`. They are refused
   with **403** within 30 seconds even if they hold a valid token.
2. **In the Google admin console:** suspend or delete the account, which stops
   new tokens being issued at all.

Deleting the `users` row instead of deactivating it is usually the wrong
move — rows across the schema reference `users.id` as the author, owner or
reviewer of records.

### Backups

`deploy/backup.sh` dumps PostgreSQL, copies the MinIO data and archives the
configuration:

```bash
npm run backup                        # ./deploy/backup.sh, default /backups/gigachad-grc
./deploy/backup.sh /mnt/backups       # or an explicit directory
./deploy/verify-backup.sh             # check an archive is intact
./deploy/restore.sh /backups/gigachad-grc/backup-2026-09-09-020000.tar.gz
```

A `backup-scheduler` container in `docker-compose.prod.yml` runs the same
script on a schedule (`deploy/cron/backup-crontab`): a daily backup at 02:00,
an integrity verification on Sundays at 04:00, and a monthly prune governed by
`BACKUP_RETENTION_DAYS`. Backups land in the `grc_backups` volume.

Copy them off the machine. A backup on the disk you are backing up is not a
backup — set `DR_REMOTE_BACKUP_ENABLED=true` with
`DR_REMOTE_BACKUP_S3_BUCKET` and AWS credentials, or `rsync` the volume
elsewhere. Test a restore before you need one.

> `ENCRYPTION_KEY` is not recoverable from a backup of the database. Store it
> in a password manager: without it, previously saved integration credentials
> cannot be decrypted.

### Logs

| What | Where |
|---|---|
| Any service | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f <service>` |
| Service names | `traefik`, `gateway`, `frontend`, `controls`, `frameworks`, `policies`, `tprm`, `trust`, `audit`, `postgres`, `minio`, `backup-scheduler` |
| Traefik access logs | stdout — `docker compose -f docker-compose.prod.yml logs traefik` (rotated at 20 MB × 5 files) |
| Backup logs | Next to the archives: `backup-<timestamp>.log` |
| In-app audit trail | **Settings → Audit Log** (stored in PostgreSQL, not in container logs) |

Every container is capped at 3 × 10 MB of JSON log file, so logs will not fill
the disk — and equally, they do not persist forever. Ship them somewhere if
you need retention.

### Health monitoring

Point your uptime monitor at `https://grc.example.com/api/system/health` and
alert on anything other than `"status":"healthy"`. Administrators can also see
**Settings → Organization Settings → System Health** in the app, which surfaces
the same data plus a production-readiness score.

---

## 10. Rollback

Deployments here are container images built from a git checkout, so rolling
back is checking out the previous commit and rebuilding.

### Code only (no schema change)

```bash
cd gigachad-grc
git log --oneline -5                       # find the commit you were on
git checkout <previous-commit-or-tag>
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

`IMAGE_TAG` in `.env.prod` tags the images (`grc-controls:${IMAGE_TAG:-latest}`).
Setting it per release — `IMAGE_TAG=2026-09-09` — lets you roll back by
pointing it at an earlier tag and running `up -d` without a rebuild, provided
those images are still on the host (`docker image ls | grep grc-`).

### Code plus schema

`prisma db push` is not reversible. If the deployment you are undoing changed
the schema, restore the database as well:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
./deploy/restore.sh /backups/gigachad-grc/backup-<timestamp>.tar.gz
git checkout <previous-commit-or-tag>
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

`deploy/restore.sh` stops the stack, restores PostgreSQL and MinIO, puts back
the archived `.env.prod` (keeping a copy of the current one) and brings things
up again. **Take a fresh backup first** — restoring discards everything
written since the archive was made.

### Configuration only

Changing a backend variable needs a restart of the services that read it:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --force-recreate controls frameworks policies tprm trust audit
```

Changing a `VITE_*` variable needs a **rebuild**, because those values are
compiled into the browser bundle:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build frontend
```

---

## Troubleshooting: traps that are real

These have all bitten someone. General local-development problems are in
[Troubleshooting](./TROUBLESHOOTING.md).

### The Firebase JWKS URL: two endpoints, one of them useless

Google publishes the keys for Firebase ID tokens at **two** addresses, and
they return different formats:

| URL | Returns | Usable here? |
|---|---|---|
| `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` | X.509 **PEM certificates** keyed by id | **No** — the `jwks-rsa` library expects a JWKS document and cannot parse PEM. You get an opaque "could not verify the token signing key" on every request |
| `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com` | A proper **JWKS** (`{"keys":[…]}`) | **Yes** |

Google's own documentation names the first one, which is why this trap is easy
to fall into. `FirebaseAuthGuard` already uses the second — it is the exported
constant `FIREBASE_JWKS_URL`. **Do not "fix" it to match the documentation.**
The keys are cached for ten minutes and Google rotates them daily, so an
outbound HTTPS connection to `www.googleapis.com` must be allowed from the
services.

### `AUTH_MODE=demo` refuses to start in production

Symptom: every service exits during start-up and never becomes healthy; the
gateway stays in `created` waiting for dependencies; the logs name
`AUTH_MODE=demo`.

Cause: `FirebaseAuthGuard` asserts in its constructor that the demo bypass is
not combined with `NODE_ENV=production`, so the failure is at boot rather than
on the first request. This is deliberate — the alternative is a production
deployment serving every request as an administrator.

Fix: comment out `AUTH_MODE` in `.env.prod` and recreate the services. The
bypass exists for `./scripts/start-demo.sh` only.

### `AUTH_AUTO_PROVISION=true` with no `AUTH_DEFAULT_ORG_ID`

Same shape of failure — a constructor error, so nothing starts. The guard
refuses to guess which organization new accounts should join. Either set the
UUID or turn auto-provisioning off.

### The gateway never starts

`gateway` depends on the frontend and all six API services reporting
*healthy*, so it is the last thing up and the first thing to look like the
problem. Check the dependencies instead:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

### A certificate never arrives

Traefik validates over HTTP on port 80. If DNS does not yet resolve to this
server, or port 80 is closed, no certificate is issued and the site is
unreachable over HTTPS. Confirm `dig +short grc.example.com`, confirm
`ufw status`, then `docker compose ... logs traefik`.

### One page in the app 404s while the rest works

That is a routing gap, not an auth problem: a prefix exists in
`frontend/vite.config.ts` (used in development) but not in
`gateway/nginx.conf` (used in production), or vice versa. The two files are
mirrors of one table and must be changed together — see
[Architecture](./ARCHITECTURE.md#the-route-table).

### CORS errors in the browser

`CORS_ORIGINS` must contain the full public origin including the scheme, e.g.
`https://grc.example.com`. Without it the services fall back to `localhost`
defaults and log a warning at start-up.
