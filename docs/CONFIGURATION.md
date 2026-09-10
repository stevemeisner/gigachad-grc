# GigaChad GRC - Configuration Reference

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Module Configuration](#module-configuration)
3. [Service Configuration](#service-configuration)
4. [Traefik Configuration](#traefik-configuration)
5. [Database Configuration](#database-configuration)
6. [Authentication Configuration](#authentication-configuration)
7. [MinIO Configuration](#minio-configuration)
8. [Security Configuration](#security-configuration)
9. [Monitoring Configuration](#monitoring-configuration)

---

## Module Configuration

GigaChad GRC is modular - you can enable/disable platform modules based on your needs.

You can configure modules in two layers:

- **Deployment defaults** via frontend environment variables (`VITE_ENABLE_*_MODULE`)
- **Per-organization** overrides via the **Module Configuration** page in the UI (Settings → Module Configuration)

**See [MODULE_CONFIGURATION.md](./MODULE_CONFIGURATION.md) for complete documentation including:**
- Available modules and their features
- Configuration presets (Full Platform, Core GRC, Compliance Only, etc.)
- Step-by-step configuration guide
- Module dependencies and best practices

### Quick Reference

| Module | Env Variable | Default |
|--------|--------------|---------|
| Compliance | `VITE_ENABLE_COMPLIANCE_MODULE` | `true` |
| Data | `VITE_ENABLE_DATA_MODULE` | `true` |
| Risk | `VITE_ENABLE_RISK_MODULE` | `true` |
| TPRM | `VITE_ENABLE_TPRM_MODULE` | `true` |
| BC/DR | `VITE_ENABLE_BCDR_MODULE` | `true` |
| Audit | `VITE_ENABLE_AUDIT_MODULE` | `true` |
| Trust | `VITE_ENABLE_TRUST_MODULE` | `true` |
| People | `VITE_ENABLE_PEOPLE_MODULE` | `true` |
| AI | `VITE_ENABLE_AI_MODULE` | `false` |
| Tools | `VITE_ENABLE_TOOLS_MODULE` | `true` |
| Config as Code | `VITE_ENABLE_CONFIG_AS_CODE_MODULE` | `true` |

> These are **build-time** values: Vite compiles them into the bundle, and
> `docker-compose.prod.yml` passes only a fixed set of `VITE_*` build
> arguments through to `frontend/Dockerfile`. To use one of these in a
> container build, add it in both places. If an organization has a saved
> module configuration, it takes precedence over these defaults for that
> organization.

---

## Environment Variables

### Quick Reference

Copy `deploy/env.example` to `.env.prod` and configure:

```bash
cp deploy/env.example .env.prod
chmod 600 .env.prod  # Restrict permissions
```

### Complete Variable Reference

#### General Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment: `development`, `staging`, `production` |
| `APP_DOMAIN` | Yes | `localhost` | Application domain (without protocol) |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `TZ` | No | `UTC` | Timezone for the application |
| `IMAGE_TAG` | No | `latest` | Docker image tag for deployments |

#### Database (PostgreSQL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_USER` | Yes | `grc` | Database username |
| `POSTGRES_PASSWORD` | Yes | - | Database password (min 16 chars recommended) |
| `POSTGRES_DB` | Yes | `gigachad_grc` | Database name |
| `DATABASE_URL` | Auto | - | Full connection string (auto-generated) |

**Connection String Format**:
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

#### Authentication (Firebase Authentication)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | Yes (unless `AUTH_MODE=demo`) | - | Firebase project id. Pins the accepted token issuer and audience; the auth guard refuses to start without it |
| `ALLOWED_EMAIL_DOMAINS` | Yes in production | empty | Comma-separated email domain allowlist. Empty disables the check |
| `AUTH_AUTO_PROVISION` | No | `false` | Create a `viewer` row on first sign-in instead of requiring one to exist |
| `AUTH_DEFAULT_ORG_ID` | Only with `AUTH_AUTO_PROVISION=true` | - | Organization UUID auto-provisioned users join |
| `AUTH_MODE` | No | unset | `demo` is the only auth bypass; hard-throws when `NODE_ENV=production` |
| `VITE_FIREBASE_API_KEY` | Yes (build-time) | - | Firebase Web API key — a public client identifier, not a secret |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes (build-time) | - | Usually `<project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Yes (build-time) | - | Same value as `FIREBASE_PROJECT_ID` |
| `VITE_ALLOWED_EMAIL_DOMAIN` | No (build-time) | - | Google `hd` account-chooser hint only; restricts nothing |

#### Object Storage (MinIO)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MINIO_ROOT_USER` | Yes | `minioadmin` | MinIO root username |
| `MINIO_ROOT_PASSWORD` | Yes | - | MinIO root password |
| `MINIO_BROWSER` | No | `off` | MinIO's own web console. Off in production; port 9001 is not published and no Traefik router points at it |
| `MINIO_DOMAIN` | No | `storage.${APP_DOMAIN}` | Host for the S3 API router (e.g. `storage.grc.example.com`) |

#### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | Yes | - | Encrypts stored integration and MCP credentials with AES-256-GCM. At least 32 characters, or the integrations service refuses to start. Not recoverable from a database backup |
| `CORS_ORIGINS` | No | localhost origins | Allowed browser origins, comma-separated, scheme included. In production an unset value only logs a warning and falls back to localhost, which will not work |

```bash
openssl rand -hex 32     # ENCRYPTION_KEY
```

The application holds no signing secret. Sign-in is Firebase, and the API
verifies Google-issued RS256 ID tokens against Google's JWKS with the issuer
and audience pinned to `FIREBASE_PROJECT_ID`.

#### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | No | `true` | Read only by the in-app production-readiness report. It does not switch the throttler off |

The limits themselves are not configurable by environment. The controls
service applies `@nestjs/throttler` with fixed tiers (5 per second, 30 per
10 seconds, 100 per minute) declared in
`services/controls/src/app.module.ts`, and Traefik applies an average-200 /
burst-100 middleware to the gateway router. `RATE_LIMIT_MAX` and
`RATE_LIMIT_WINDOW_MS` are read by no service; setting them changes nothing.

#### TLS/SSL (Let's Encrypt)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACME_EMAIL` | Yes | - | Email for certificate notifications |

#### API Gateway (Traefik)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRAEFIK_LOG_LEVEL` | No | `WARN` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` |

#### Email Notifications

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_PROVIDER` | No | `smtp` | `console`, `smtp`, `sendgrid` or `ses`. `console` logs each message instead of sending it |
| `EMAIL_FROM` | No | `noreply@gigachad-grc.com` | From address |
| `EMAIL_FROM_NAME` | No | `GigaChad GRC` | From display name |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | With `EMAIL_PROVIDER=smtp` | - | SMTP server and credentials |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_SECURE` | No | `false` | Use an implicit TLS connection |
| `SENDGRID_API_KEY` | With `EMAIL_PROVIDER=sendgrid` | - | SendGrid API key |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | With `EMAIL_PROVIDER=ses` | `us-east-1` for the region | SES credentials |

> An unset `EMAIL_PROVIDER` means `smtp`, and an unrecognised value is
> treated as `smtp` as well. If the selected provider's configuration is
> incomplete, the email service falls back to console mode: messages are
> written to the log and never sent, without raising an error.
> `npm run validate:production` checks for that combination.

#### AI (Optional)

The AI provider API keys are environment variables and nothing else: there
is no field for them in the UI and they are not stored in the database.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | No | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model |
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-3-5-sonnet-20241022` | Anthropic model |

The per-organization AI settings saved in the UI (Settings → AI
Configuration) are the provider, model, enabled flag, temperature and token
ceiling — no credential. A saved model name overrides `OPENAI_MODEL` /
`ANTHROPIC_MODEL` for that organization.

#### Backups

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKUP_RETENTION_DAYS` | No | `30` | How long archives are kept |
| `BACKUP_COMPRESSION_LEVEL` | No | `6` | gzip level used by `deploy/backup.sh` |
| `DR_REMOTE_BACKUP_ENABLED` | No | `false` | Copy each archive to S3 after it is written |
| `DR_REMOTE_BACKUP_S3_BUCKET` | With remote backup | - | Destination bucket |
| `DR_REMOTE_BACKUP_REGION` | No | `us-east-1` | Destination region |

The backup directory is the first argument to `deploy/backup.sh`, not an
environment variable; it defaults to `/backups/gigachad-grc`.

#### Not environment variables

- **Credentials for third-party evidence integrations** — GitHub, Okta, AWS,
  Azure, Keycloak and the rest of the connectors the product collects
  evidence *from*. These are entered under Settings → Integrations and
  stored encrypted.
- **MCP server definitions** — hard-coded in
  `services/controls/src/mcp/mcp-servers.config.ts`.

---

## Service Configuration

### Controls Service (Port 3001)

```yaml
# docker-compose.prod.yml
environment:
  NODE_ENV: production
  PORT: 3001
  DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
  MINIO_ENDPOINT: minio
  MINIO_PORT: 9000
  MINIO_USE_SSL: false
  MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
  MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
  # Firebase Authentication (Google provider only). The ID token proves
  # IDENTITY ONLY - role, permissions and organization are read from
  # PostgreSQL on every request, never from token claims.
  FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
  ALLOWED_EMAIL_DOMAINS: ${ALLOWED_EMAIL_DOMAINS}
  AUTH_AUTO_PROVISION: ${AUTH_AUTO_PROVISION:-false}
  AUTH_DEFAULT_ORG_ID: ${AUTH_DEFAULT_ORG_ID}
  LOG_LEVEL: ${LOG_LEVEL:-info}
  RATE_LIMIT_ENABLED: ${RATE_LIMIT_ENABLED:-true}
  RATE_LIMIT_MAX: ${RATE_LIMIT_MAX:-100}
  RATE_LIMIT_WINDOW_MS: ${RATE_LIMIT_WINDOW_MS:-60000}
```

### All Services Follow Same Pattern

Each service accepts:

| Variable | Description |
|----------|-------------|
| `PORT` | Service port (3001 controls, 3002 frameworks, 3004 policies, 3005 tprm, 3006 trust, 3007 audit) |
| `DATABASE_URL` | PostgreSQL connection string |
| `MINIO_*` | MinIO configuration |
| `FIREBASE_PROJECT_ID`, `ALLOWED_EMAIL_DOMAINS`, `AUTH_AUTO_PROVISION`, `AUTH_DEFAULT_ORG_ID` | Authentication settings read by `FirebaseAuthGuard` |
| `LOG_LEVEL` | Logging level |
| `RATE_LIMIT_*` | Rate limiting settings |

Every service exposes `GET /health`, which is what the compose healthcheck
polls. The controls service additionally exposes `GET /api/system/health`.

---

## Traefik Configuration

### How Traefik is configured

In production, Traefik is configured entirely by **command flags** in
`docker-compose.prod.yml` — not by a static file. `gateway/traefik.yml`
exists but is only used by the local `docker-compose.yml` stack. The flags
that matter:

```yaml
command:
  - "--api.dashboard=false"
  - "--providers.docker=true"
  - "--providers.docker.exposedbydefault=false"
  - "--entrypoints.web.address=:80"
  - "--entrypoints.websecure.address=:443"
  - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
  - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
  - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
  - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
  - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
  - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  - "--log.level=${TRAEFIK_LOG_LEVEL:-WARN}"
  - "--log.format=json"
  - "--accesslog=true"
  - "--accesslog.format=json"
```

Notes:

- The dashboard is **off**. Nothing but ports 80 and 443 is published.
- Port 80 exists to redirect to HTTPS and to answer the ACME HTTP challenge;
  it must stay open in the firewall or certificate renewal fails.
- The access log goes to **stdout**, so Docker's `json-file` driver owns
  rotation (`docker compose logs traefik`). There is no log volume: a file
  the application writes itself is never rotated by Docker and would grow
  until the disk filled.
- `acme.json` lives in the `traefik_letsencrypt` volume. Back it up or accept
  a fresh issuance after a rebuild.
- Routing is discovered from container labels (`providers.docker`), and only
  the `gateway` and `minio` services opt in with `traefik.enable=true`.

### Dynamic Configuration (Docker Labels)

Only the `gateway` service routes the application. Its labels in
`docker-compose.prod.yml` are the whole routing table as far as Traefik is
concerned; the `/api/*` fan-out happens inside `gateway/nginx.conf`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=grc-dmz"
  - "traefik.http.routers.gateway.rule=Host(`${APP_DOMAIN}`)"
  - "traefik.http.routers.gateway.entrypoints=websecure"
  - "traefik.http.routers.gateway.tls.certresolver=letsencrypt"
  - "traefik.http.services.gateway.loadbalancer.server.port=80"
  - "traefik.http.middlewares.gateway-ratelimit.ratelimit.average=200"
  - "traefik.http.middlewares.gateway-ratelimit.ratelimit.burst=100"
  - "traefik.http.routers.gateway.middlewares=gateway-ratelimit"
```

The six API services carry **no** Traefik labels in production — they are on
the `internal: true` network and are reached only through the gateway. (The
local `docker-compose.yml` stack is different: there Traefik routes each
`PathPrefix` straight to a service.)

### Security headers

Security headers are not a Traefik middleware here. Each NestJS service
applies `helmet` in its own `main.ts`, with `contentSecurityPolicy` disabled
because the services serve API responses rather than documents. The
frontend's own nginx configuration serves the SPA.

---

## Database Configuration

PostgreSQL 16 runs from the official `postgres:16-alpine` image with its
default configuration. No `postgresql.conf` is shipped or mounted, and there
is no PgBouncer: the deployment is a single VM with one replica of each
service, and Prisma pools connections in-process.

What `docker-compose.prod.yml` does set:

| Setting | Value | Why |
|---|---|---|
| `POSTGRES_INITDB_ARGS` | `--encoding=UTF8 --locale=en_US.UTF-8` | Applied once, at first initialization |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | Subdirectory of the `postgres_data` volume |
| `shm_size` | 256 MB | The default 64 MB is too small for larger sorts and parallel queries |
| `read_only` | true | With `/tmp` and `/run/postgresql` as tmpfs |
| Memory limit | 1536 MB | Reservation 512 MB |

Two volumes hold state: `postgres_data` (the cluster) and `postgres_backups`
(mounted at `/backups`). `./database/init` is mounted read-only at
`/docker-entrypoint-initdb.d`, so those SQL files run in filename order the
first time the container starts against an empty data directory, and never
again.

The Prisma schema is applied separately with `prisma db push` — see
[Deployment Runbook §7.2](./DEPLOYMENT-RUNBOOK.md#72-apply-the-schema).
There is no baseline migration, so `prisma migrate deploy` has nothing to
apply.

---

## Authentication Configuration

Identity comes from **Firebase Authentication with Google sign-in only**.
There is nothing to configure in this repository beyond the environment
variables above — the provider itself is configured in the Firebase console:

1. **Build → Authentication → Sign-in method**: enable **Google** and nothing
   else. The backend rejects any token whose `sign_in_provider` is not
   `google.com`.
2. **Authentication → Settings → Authorized domains**: add the app's public
   hostname. This names the origins allowed to *complete* a sign-in; it does
   not decide who may sign in.
3. **Project settings → General**: collect the Project ID, Web API key and
   auth domain for `FIREBASE_PROJECT_ID` / `VITE_FIREBASE_*`.

See [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md) for the full procedure,
including creating the first administrator row.

### Roles

Roles live in the `users.role` column in PostgreSQL, never in a token claim.
`UserRole` is:

| Role | Description | Fallback permission group |
|------|-------------|---------------------------|
| `admin` | Full access | Administrator |
| `compliance_manager` | Manage controls, evidence and policies | Compliance Manager |
| `auditor` | Read-only plus evidence approval | Auditor |
| `viewer` | Read-only | Viewer |

The role is only a fallback: a user's real permissions come from the
permission groups they belong to plus per-user overrides. See
[Security Model](./SECURITY_MODEL.md#authorization).

---

## MinIO Configuration

Evidence, policy documents and integration artefacts all go into **one
bucket**, named by `MINIO_BUCKET` (or `S3_BUCKET`) and defaulting to
`grc-storage`. Objects are separated by key prefix, not by bucket.

**Nothing in this repository creates that bucket.** Create it once, after
MinIO first starts:

```bash
# Substitute the project's network name; `docker network ls | grep grc-dmz`.
docker run --rm --network gigachad-grc_grc-dmz \
  -e MC_HOST_local="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@minio:9000" \
  minio/mc mb --ignore-existing local/grc-storage
```

Leave the bucket private. The application serves evidence through presigned
URLs, so no anonymous read policy is needed.

MinIO's own console is off by default (`MINIO_BROWSER=off`), port 9001 is not
published and no Traefik router points at it. `docker-compose.prod.yml`
carries the SSH tunnel recipe for reaching it deliberately.

---

## Security Configuration

| Concern | Where it is handled |
|---|---|
| TLS | Traefik, with Let's Encrypt. See [SSL Configuration](./SSL_CONFIGURATION.md) for a custom certificate |
| Secrets | `.env.prod`, `chmod 600`, never committed. Docker secrets are not wired up: the services read plain environment variables |
| Network isolation | `grc-network` is `internal: true`. PostgreSQL and the six API services publish no ports and are unreachable from the host network |
| Container hardening | `no-new-privileges`, all capabilities dropped, read-only root filesystems on PostgreSQL and the six API services |
| Credentials at rest | Integration and AI credentials are encrypted with `ENCRYPTION_KEY` before they are stored |
| Request limits | Traefik rate-limit middleware on the gateway router, plus `RATE_LIMIT_*` inside the services |

There are no Kubernetes manifests in this repository, so there are no
NetworkPolicies to write. [Security Model](./SECURITY_MODEL.md) describes the
authentication and authorization design.

---

## Monitoring Configuration

The optional monitoring stack lives in `deploy/monitoring/` and is started
separately from the application:

| File | Purpose |
|------|---------|
| `docker-compose.monitoring.yml` | Prometheus, Grafana, Loki, Promtail, node-exporter, cAdvisor, Alertmanager |
| `prometheus.yml` | Scrape targets |
| `alerts.yml` | Alert rules |
| `alertmanager.yml` | Alert routing |
| `loki-config.yml`, `promtail-config.yml` | Log aggregation |

### Prometheus Targets

Only the controls service currently exports application metrics — it is the
one service wired to `@willsoto/nestjs-prometheus`. The other five job
definitions are present but commented out in `deploy/monitoring/prometheus.yml`
precisely because they have no `/metrics` endpoint yet.

```yaml
  - job_name: 'grc-controls'
    metrics_path: /metrics
    static_configs:
      - targets: ['controls:3001']

  - job_name: 'minio'
    metrics_path: /minio/v2/metrics/cluster
    static_configs:
      - targets: ['minio:9000']
```

Note the path: metrics are on `/metrics`, not `/health`. `/health` returns
JSON for a container healthcheck, not a Prometheus exposition.

### Alert Rules

Defined in `deploy/monitoring/alerts.yml`.

### Grafana

`docker-compose.monitoring.yml` mounts
`./deploy/monitoring/grafana/provisioning` read-only, but **that directory
does not exist in the repository** — create it (with the usual
`datasources/` and `dashboards/` subdirectories) before starting the
monitoring stack, or the mount produces an empty provisioning tree and
Grafana comes up with no data source configured. There are no pre-built
dashboard JSON files here either.

---

## Configuration Validation

`npm run validate:production` (`scripts/validate-production.sh`) is the
production readiness check. It reads `.env.prod` and verifies the required
variables, secret strength, that `AUTH_MODE=demo` is not enabled in
production, and the host prerequisites a deploy needs.

```bash
npm run validate:production
```

Check that compose resolves the file you think it does:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod config --services
docker compose -f docker-compose.prod.yml --env-file .env.prod config | grep -A5 'controls:'
```

Once the stack is running:

```bash
# Per-service health, from inside the network.
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T gateway wget -qO- http://controls:3001/health

# Aggregate health through the public gateway (controls service, unauthenticated).
curl -fsS https://grc.example.com/api/system/health
```

