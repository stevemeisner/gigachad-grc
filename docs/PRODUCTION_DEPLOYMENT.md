# Production Deployment: Architecture and Reference

This document describes what a production deployment of GigaChad GRC is made
of, and collects the reference material a deployment needs.

**It is not the procedure.** The ordered, start-to-finish procedure — Firebase
project, server, `.env.prod`, schema, first administrator, verification,
rollback — is [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md). Follow that;
come back here for architecture, sizing detail and troubleshooting.

## Contents

1. [Architecture](#architecture)
2. [Sizing and prerequisites](#sizing-and-prerequisites)
3. [Environment configuration](#environment-configuration)
4. [Database](#database)
5. [Authentication](#authentication)
6. [TLS](#tls)
7. [Monitoring and logging](#monitoring-and-logging)
8. [Security checklist](#security-checklist)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance and updates](#maintenance-and-updates)

---

## Architecture

```
                         Internet
                            │
                            ▼
                  ┌───────────────────┐
                  │      Traefik      │   TLS termination, Let's Encrypt
                  │  ports 80 / 443   │   the only container publishing ports
                  └───────────────────┘
                            │  grc-dmz
                            ▼
                  ┌───────────────────┐
                  │  nginx gateway    │   gateway/nginx.conf
                  │  single entrypoint│   SPA + 53 /api/* route prefixes
                  └───────────────────┘
                    │              │  grc-network (internal: true)
        ┌───────────┘              └────────────┐
        ▼                                       ▼
┌────────────────┐               ┌──────────────────────────────┐
│    frontend    │               │  controls  frameworks        │
│  static SPA    │               │  policies  tprm  trust audit │
│  nginx, :3000  │               │        six NestJS services   │
└────────────────┘               └──────────────────────────────┘
                                        │              │
                                        ▼              ▼
                                 ┌────────────┐ ┌────────────┐
                                 │ PostgreSQL │ │   MinIO    │
                                 └────────────┘ └────────────┘
```

**No authentication server runs in this deployment.** The browser obtains an
ID token from Firebase directly; each service verifies that token against
Google's public keys and then reads the caller's role and organization from
PostgreSQL.

### Containers

`docker-compose.prod.yml` defines the whole stack. Do not write your own.

| Container | Role |
|---|---|
| `traefik` | TLS termination and Let's Encrypt (`ACME_EMAIL`); the only container publishing ports 80 and 443 |
| `gateway` | nginx, `gateway/nginx.conf`; the single public entrypoint. Traefik routes `Host(${APP_DOMAIN})` here and nowhere else |
| `frontend` | The built SPA, served by nginx on port 3000 inside the network |
| `controls` (3001), `frameworks` (3002), `policies` (3004), `tprm` (3005), `trust` (3006), `audit` (3007) | The six NestJS API services. There is no service on 3003 |
| `postgres` | PostgreSQL 16, no published port |
| `minio` | Object storage for evidence files. Carries a Traefik router for `storage.${APP_DOMAIN}` (the S3 API only), which resolves only if you create that DNS record. There is no console router: `MINIO_BROWSER` defaults to `off` and port 9001 is not published |
| `backup-scheduler` | Runs `deploy/backup.sh` on the schedule in `deploy/cron/backup-crontab` |

Two networks: `grc-dmz`, shared by Traefik, the gateway and MinIO, and
`grc-network`, which is `internal: true` — so PostgreSQL and the six API
services are not reachable from outside the host at all. PostgreSQL and the
six API services run with a read-only root filesystem; containers drop all
Linux capabilities and set `no-new-privileges`.

All six API services serve `/health`, `/health/live` and `/health/ready` on
their own port inside the network. The controls service additionally exposes
an unauthenticated `GET /api/system/health` that is reachable through the
public gateway.

Because the gateway owns routing, individual API services carry no Traefik
`PathPrefix` labels. Adding an `/api/*` prefix means editing
`gateway/nginx.conf` **and** the Vite dev proxy in `frontend/vite.config.ts`
together — a prefix present in only one works in only one environment.

---

## Sizing and prerequisites

One VM runs everything. Horizontal scaling is not supported by this compose
file: each service is a single replica.

| Resource | Minimum | Comfortable |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 80 GB SSD |

Idle memory use is around 370 MB for the whole stack. The peak is the **first
image build**: a Vite production build of the frontend needs roughly
1.5–2.5 GB. Build images in CI and pull them if the machine is smaller than
that.

[Hosting Requirements](./HOSTING-REQUIREMENTS.md) has the cost comparison and
provider options. [Deployment Runbook §4](./DEPLOYMENT-RUNBOOK.md#4-provision-the-server)
has the Docker install, firewall and DNS steps.

Only Docker Engine 24+, the Compose v2 plugin, git and openssl are needed on
the server. Node.js is not: every build happens inside Docker.

### Domain and DNS

One `A` record for the application hostname is enough. There is **no auth
subdomain** — identity comes from Firebase, which the browser talks to
directly, and the API is served from the same host under `/api`. A second
record for `storage.${APP_DOMAIN}` is optional and only needed if you want the
MinIO S3 API published.

---

## Environment configuration

The single production environment file is **`.env.prod`**, copied from the
shipped template:

```bash
cp deploy/env.example .env.prod
chmod 600 .env.prod
```

Every compose command passes `--env-file .env.prod` explicitly. `deploy/backup.sh`,
`deploy/restore.sh` and `scripts/validate-production.sh` read the same file,
and `docker-compose.prod.yml` mounts it into the backup scheduler.

`deploy/env.example` is the authoritative list of variables and carries a
comment for each one. [Configuration](./CONFIGURATION.md) and
[Env Configuration](./ENV_CONFIGURATION.md) explain them;
[Deployment Runbook §5](./DEPLOYMENT-RUNBOOK.md#5-configure-the-environment)
lists the ones you must set and where each value comes from.

Validate the file before deploying:

```bash
npm run validate:production
```

Two notes on credentials that are easy to get wrong:

- **AI provider keys are environment variables only** — `OPENAI_API_KEY` and
  `ANTHROPIC_API_KEY`. There is no field for them in the UI. What Settings →
  AI Configuration stores per organization is the provider, model, enabled
  flag, temperature and token ceiling.
- **Email has two paths.** The per-organization configuration under
  Settings → Notifications stores SMTP, SendGrid and Slack credentials
  encrypted in the database. The platform-wide email service reads
  `EMAIL_PROVIDER` and the matching `SMTP_*` / `SENDGRID_API_KEY` /
  `AWS_*` variables from `.env.prod`. Set the environment variables if you
  want outbound mail to work before anyone configures an organization.

### Object storage alternatives

`STORAGE_TYPE` defaults to `local`. To use AWS S3 instead of the bundled
MinIO, set `STORAGE_TYPE=s3` on the service containers along with
`S3_ENDPOINT`, `S3_PORT`, `S3_USE_SSL`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION` and `S3_BUCKET`. The `MINIO_*` names
take precedence over the `S3_*` aliases wherever both are read.

### Frontend build arguments

Every `VITE_*` value is **build-time**: Vite compiles it into the JavaScript
bundle, so changing one requires rebuilding the `frontend` image rather than
restarting it.

`docker-compose.prod.yml` passes a fixed set of them through to
`frontend/Dockerfile` as build arguments, read from `.env.prod`:

| Variable | Effect |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key. A **public** client identifier, not a secret: it ships inside the browser bundle by design |
| `VITE_FIREBASE_AUTH_DOMAIN` | Normally `<project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Must equal the backend's `FIREBASE_PROJECT_ID`, or every token is rejected for a bad audience |
| `VITE_ALLOWED_EMAIL_DOMAIN` | Cosmetic. Passed to Google as the `hd` account-chooser hint. Restricts nothing — the enforcing check is the backend's `ALLOWED_EMAIL_DOMAINS` |

Those are all the browser needs: the SPA and the API are served from the same
origin through the gateway, so no API URL has to be configured. To use any
other `VITE_*` value in a container build you must add it to both the
`frontend.build.args` block in `docker-compose.prod.yml` and the `ARG`/`ENV`
pair in `frontend/Dockerfile`. The optional ones the code reads are:

| Variable | Effect |
|---|---|
| `VITE_API_URL` | Absolute API base URL, if not same-origin |
| `VITE_ERROR_TRACKING_ENABLED`, `VITE_SENTRY_DSN`, `VITE_APP_VERSION`, `VITE_ENV` | Sentry error tracking |
| `VITE_ENABLE_*_MODULE` | Deployment default for each module; a saved per-organization configuration overrides it |

---

## Database

One PostgreSQL database holds everything. There is one Prisma schema,
`services/shared/prisma/schema.prisma`, shared by all six services.

Two things create the schema, and they happen in this order:

1. **`database/init/*.sql` run automatically.** `docker-compose.prod.yml`
   mounts `./database/init` at `/docker-entrypoint-initdb.d`, so PostgreSQL
   executes those files in filename order the first time it starts against an
   empty data directory — and never again. Do not run them by hand.
2. **`prisma db push` applies the Prisma schema.**
   [Deployment Runbook §7.2](./DEPLOYMENT-RUNBOOK.md#72-apply-the-schema) has
   the exact commands, including how to reach the database from a throwaway
   container when no PostgreSQL port is published.

> **Do not use `prisma migrate deploy`.** This repository ships no baseline
> migration, so it has nothing to apply. `prisma db push` is the supported
> way to create or update the schema.

Backups are `deploy/backup.sh` (PostgreSQL dump plus the MinIO data, archived
together), `deploy/verify-backup.sh` and `deploy/restore.sh`. The
`backup-scheduler` container runs the same script on a schedule and honours
`BACKUP_RETENTION_DAYS`. See
[Deployment Runbook §9](./DEPLOYMENT-RUNBOOK.md#9-day-two-operations).

> `ENCRYPTION_KEY` cannot be recovered from a database backup. Store it
> separately, or the encrypted integration and AI credentials in a restored
> database are unreadable.

---

## Authentication

Firebase Authentication with Google sign-in, and nothing else. The
application stores no passwords, has no self-registration, no password reset
and no first-run wizard.

A Firebase ID token proves one thing: which Google account is calling. Role,
permissions, organization and account status are read from PostgreSQL on
every uncached request — never from a token claim. `FirebaseAuthGuard`
(`services/shared/src/auth/firebase-auth.guard.ts`) rejects a token unless it
is RS256, issued by and audienced to `FIREBASE_PROJECT_ID`, unexpired, has
`email_verified` true and a `google.com` sign-in provider.

Who may sign in is decided by two server-side layers:

| Layer | Variable | Behaviour |
|---|---|---|
| Email domain allowlist | `ALLOWED_EMAIL_DOMAINS` | Comma-separated. A mismatch is **403**. Empty disables the check — never in production |
| A provisioned `users` row | `AUTH_AUTO_PROVISION` (default `false`) | An address with no matching row is refused **401**, whatever domain it came from |

`AUTH_AUTO_PROVISION=true` requires `AUTH_DEFAULT_ORG_ID`; the guard refuses
to start otherwise, and auto-provisioned accounts are created as `viewer`.

`AUTH_MODE=demo` is the only bypass in the system. It serves every request as
the seeded demo administrator and hard-throws at start-up when `NODE_ENV` is
`production`. Never set it in `.env.prod`.

Setting up the Firebase project, restricting sign-in and creating the first
administrator are
[Deployment Runbook §2](./DEPLOYMENT-RUNBOOK.md#2-create-the-firebase-project),
[§3](./DEPLOYMENT-RUNBOOK.md#3-restrict-who-can-sign-in) and
[§6](./DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator). The security
properties of the whole scheme are in [Security Model](./SECURITY_MODEL.md).

---

## TLS

Traefik obtains and renews a Let's Encrypt certificate for `APP_DOMAIN`
automatically; nothing else has to be configured. Port 80 must stay open for
the HTTP-01 challenge even though the application redirects to HTTPS.

To supply your own certificate instead, see
[SSL Configuration](./SSL_CONFIGURATION.md).

---

## Monitoring and logging

The production stack has no monitoring containers. An optional stack is
shipped separately in `deploy/monitoring/docker-compose.monitoring.yml`:
Prometheus, Grafana, Loki, Promtail, cAdvisor, node-exporter and
Alertmanager.

```bash
docker compose -f deploy/monitoring/docker-compose.monitoring.yml up -d
```

| Component | Host port |
|---|---|
| Prometheus | 9090 |
| Grafana | 3030 (`GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`, both defaulting to `admin`) |
| Loki | 3100 |
| Alertmanager | 9093 |
| cAdvisor | 8081 |
| node-exporter | 9100 |

Those ports are published on the host. Do not open them in the firewall;
reach them over an SSH tunnel.

Without that stack, logs are Docker's:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f controls
```

Sentry error tracking exists in the browser only, and is off unless
`VITE_ERROR_TRACKING_ENABLED=true` and `VITE_SENTRY_DSN` are supplied as
build arguments. The API services do not report to Sentry. (`services/controls`
does contain a Sentry *integration connector*, which reads evidence out of a
customer's Sentry account — that is unrelated to error reporting from this
deployment.)

---

## Security checklist

Before deploying:

- [ ] Every `CHANGE_ME` value in `.env.prod` replaced
- [ ] `ENCRYPTION_KEY` generated with `openssl rand -hex 32` (at least 32 characters) and stored somewhere outside the server
- [ ] `FIREBASE_PROJECT_ID` set, and Google is the only sign-in method enabled in the Firebase console
- [ ] `ALLOWED_EMAIL_DOMAINS` set — never empty in production
- [ ] `AUTH_MODE` unset, and `AUTH_AUTO_PROVISION=false` unless `AUTH_DEFAULT_ORG_ID` is also set
- [ ] `CORS_ORIGINS` names the real origin, with scheme and no trailing slash
- [ ] `MINIO_BROWSER=off`
- [ ] `npm run validate:production` passes
- [ ] Firewall allows only 22, 80 and 443

After deploying:

- [ ] The site serves a valid certificate and redirects HTTP to HTTPS
- [ ] Sign-in works for an allowed account and is refused for an outside one
- [ ] `deploy/backup.sh` has produced an archive and `deploy/verify-backup.sh` passes on it
- [ ] A restore has been tested somewhere other than production
- [ ] Backups are copied off the machine

Ongoing: rotate secrets on a schedule, review dependency advisories, and read
the access logs.

---

## Troubleshooting

[Deployment Runbook §8](./DEPLOYMENT-RUNBOOK.md#8-verify-sign-in-end-to-end)
maps every sign-in failure message to its cause and fix, and the runbook's
closing section covers the traps that are specific to this stack. What
follows is the rest.

### The gateway will not start

The gateway `depends_on` the frontend and all six services being healthy. If
it sits in `created`, one of those is unhealthy — look there, not at the
gateway.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

### Database connection failures

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres pg_isready -U grc
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 controls
```

The services build `DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`
and `POSTGRES_DB` inside `docker-compose.prod.yml`. A password changed in
`.env.prod` after the database volume was created does not change the
password in PostgreSQL — the two drift apart, and that is the usual cause.

### Authentication failures

```bash
# Does the backend expect the project your tokens come from?
docker compose -f docker-compose.prod.yml --env-file .env.prod exec controls env | grep FIREBASE_PROJECT_ID

# Are the restriction layers set as intended?
docker compose -f docker-compose.prod.yml --env-file .env.prod exec controls \
  env | grep -E 'ALLOWED_EMAIL_DOMAINS|AUTH_AUTO_PROVISION|AUTH_MODE'

# Does the person have a users row, and is it active?
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U grc -d gigachad_grc \
  -c "SELECT email, role, status, external_id FROM users;"
```

Each rejection names its own cause; read the message rather than guessing.
A resolved identity is cached for 30 seconds, so a database change can take
that long to take effect.

If the browser never obtains a token at all, the hostname is missing from
Firebase → Authentication → Settings → Authorized domains, or the `frontend`
image was not rebuilt after a `VITE_FIREBASE_*` change.

### A page 404s while the rest of the app works

That path prefix is missing from `gateway/nginx.conf`. See the runbook's
troubleshooting section.

### Performance

```bash
docker stats
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U grc -d gigachad_grc -c "SELECT * FROM pg_stat_activity;"
```

---

## Maintenance and updates

Update:

```bash
# 1. Back up first.
./deploy/backup.sh

# 2. Take the new code.
git pull

# 3. Rebuild and restart.
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. Apply any schema change (runbook 7.2).
# 5. Verify.
curl -fsS https://your-domain/api/system/health
```

Rollback is [Deployment Runbook §10](./DEPLOYMENT-RUNBOOK.md#10-rollback),
which distinguishes a code-only rollback from one that also has to restore
the database.

Restarting a single service without touching the rest:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --build controls
```
