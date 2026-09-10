# GigaChad GRC - Environment Configuration Reference

Reference for the environment variables the code actually reads. Every
variable named here appears in the source; where a default is given, it is
the default the code applies.

`deploy/env.example` is the shipped template. Copy it to **`.env.prod`** —
that is the single production environment filename, and what
`docker-compose.prod.yml`, `deploy/backup.sh`, `deploy/restore.sh` and
`scripts/validate-production.sh` all read.

```bash
cp deploy/env.example .env.prod
chmod 600 .env.prod
```

For the deployment procedure itself see
[Deployment Runbook](./DEPLOYMENT-RUNBOOK.md).

---

## Backend Services

### Core

| Variable | Example | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` \| `production` | Environment mode |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | PostgreSQL connection string |
| `PORT` | `3001` | Overrides the service's own default port |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### Database

```bash
# The services read DATABASE_URL and nothing else. Inside Docker the host is
# the `postgres` service on 5432; from the host it is localhost:5433, because
# docker-compose.yml publishes 5433 to avoid clashing with a local PostgreSQL.
DATABASE_URL=postgresql://grc:grc_secret@localhost:5433/gigachad_grc

# Read by the postgres container itself. docker-compose.prod.yml builds
# DATABASE_URL for the services from these three values.
POSTGRES_USER=grc
POSTGRES_PASSWORD=grc_secret
POSTGRES_DB=gigachad_grc
```

### Authentication (Firebase Authentication)

The Firebase ID token proves **identity only**. Role, permissions and
organization are read from PostgreSQL on every request. Every variable below
is read by `FirebaseAuthGuard` (`services/shared/src/auth/firebase-auth.guard.ts`).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_PROJECT_ID` | Yes (unless `AUTH_MODE=demo`) | — | Firebase project id. Pins the accepted token issuer (`https://securetoken.google.com/<id>`) and audience. The guard refuses to start without it |
| `ALLOWED_EMAIL_DOMAINS` | Yes in production | empty (check disabled) | Comma-separated email domain allowlist, e.g. `example.com,example.co.uk`. Entries are lowercased and a leading `@` is stripped. A mismatch is `403` |
| `AUTH_AUTO_PROVISION` | No | `false` | When `false`, an address with no `users` row is refused `401`. When `true`, first sign-in creates a `viewer` row |
| `AUTH_DEFAULT_ORG_ID` | Only with `AUTH_AUTO_PROVISION=true` | — | Organization UUID auto-provisioned users join. The guard throws at start-up if auto-provisioning is on without it |
| `AUTH_MODE` | No | unset | `demo` is the **only** authentication bypass: every request is served as the seeded demo user. The guard hard-throws when `NODE_ENV=production` |

The guard also rejects a token that is not RS256, is expired, has
`email_verified` false, or whose sign-in provider is not `google.com`. None
of that is configurable.

```bash
# Production
FIREBASE_PROJECT_ID=acme-grc
ALLOWED_EMAIL_DOMAINS=example.com
AUTH_AUTO_PROVISION=false

# Local demo only — never in production
# AUTH_MODE=demo
```

### File Storage

`STORAGE_TYPE` selects the provider and defaults to `local`. The `MINIO_*`
names take precedence over their `S3_*` and `AWS_*` aliases wherever both are
read.

```bash
# Local filesystem (development)
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./storage          # default ./storage
LOCAL_STORAGE_BASE_URL=/files         # default /files

# MinIO (what docker-compose.prod.yml wires up) or S3
STORAGE_TYPE=minio                    # or s3
MINIO_ENDPOINT=minio                  # or S3_ENDPOINT
MINIO_PORT=9000                       # or S3_PORT, default 9000
MINIO_USE_SSL=false                   # or S3_USE_SSL
MINIO_ACCESS_KEY=...                  # or AWS_ACCESS_KEY_ID
MINIO_SECRET_KEY=...                  # or AWS_SECRET_ACCESS_KEY
MINIO_BUCKET=grc-storage              # or S3_BUCKET, default grc-storage
AWS_REGION=us-east-1                  # default us-east-1

# Azure Blob Storage
STORAGE_TYPE=azure
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_ACCOUNT_NAME=...
AZURE_STORAGE_ACCOUNT_KEY=...
AZURE_STORAGE_SAS_TOKEN=...
AZURE_STORAGE_CONTAINER=gigachad-grc  # default gigachad-grc
```

There is one bucket, not one per module. Nothing in this repository creates
it — see [Configuration](./CONFIGURATION.md#minio-configuration).

### Email

```bash
EMAIL_PROVIDER=resend                 # resend | console | smtp | sendgrid | ses; unset means smtp
EMAIL_FROM=noreply@yourcompany.com    # required unless the provider is console
EMAIL_FROM_NAME=GigaChad GRC

# EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...                 # host, port and username are fixed in the service

# EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587                         # default 587
SMTP_SECURE=false                     # default false
SMTP_USER=notifications@yourcompany.com
SMTP_PASS=...

# EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG....

# EMAIL_PROVIDER=ses
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

The variable is `SMTP_PASS`, not `SMTP_PASSWORD`. An unrecognised
`EMAIL_PROVIDER`, or a selected provider whose configuration is incomplete,
makes the email service refuse to start under `NODE_ENV=production`. Outside
production it falls back to console mode: messages are logged and never sent.

Resend sends nothing until a sending domain is verified in its dashboard, and
`EMAIL_FROM` must be an address on that domain.

### Security

```bash
# Encrypts stored integration, MCP and notification credentials with
# AES-256-GCM. At least 32 characters, or the services that use it refuse to
# start. Losing it makes those credentials unreadable.
ENCRYPTION_KEY=...

# ENCRYPTION_KEY is the only secret the application holds. Sign-in is
# Firebase: the API verifies Google-issued RS256 ID tokens against Google's
# JWKS with the issuer and audience pinned to FIREBASE_PROJECT_ID, so there
# is no signing secret to configure.

# Browser origins allowed to call the API. Scheme included, no trailing
# slash. Unset in production only logs a warning and falls back to localhost
# origins, which will not work for a real deployment.
CORS_ORIGINS=https://grc.yourcompany.com

# Read only by the in-app production-readiness report; it does not switch
# the throttler off. The limits themselves are hard-coded (5/second,
# 30/10 seconds, 100/minute in the controls service, plus a Traefik
# average-200/burst-100 middleware on the gateway). RATE_LIMIT_MAX and
# RATE_LIMIT_WINDOW_MS are read by no service.
RATE_LIMIT_ENABLED=true
```

### Service Ports

Each service reads `PORT` and falls back to its own default; there is no
per-service port variable.

| Service | Default port |
|---------|--------------|
| Frontend | 3000 |
| Controls | 3001 |
| Frameworks | 3002 |
| Policies | 3004 |
| TPRM | 3005 |
| Trust | 3006 |
| Audit | 3007 |

There is no service on 3003. Locally, PostgreSQL is published on 5433 and
MinIO on 9000 (S3 API) and 9001 (console). In production nothing but 80 and
443 is published: the nginx gateway (`gateway/nginx.conf`) is the single
public entrypoint and the services share an internal Docker network.

Every service exposes `GET /health`, `GET /health/live` and
`GET /health/ready`; controls additionally exposes `GET /api/system/health`.

---

## Frontend Configuration

Frontend variables must be prefixed with `VITE_`, and every one of them is a
**build-time** input: Vite compiles the value into the bundle, so changing
one requires rebuilding the `frontend` image rather than restarting it.

`docker-compose.prod.yml` passes only a fixed set of them through to
`frontend/Dockerfile`. To use any other one in a container build, add it to
both the `frontend.build.args` block and the `ARG`/`ENV` pair in the
Dockerfile.

### Firebase

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_FIREBASE_API_KEY` | `AIza...` | Firebase Web API key. A **public** client identifier, not a secret — it ships in the browser bundle by design |
| `VITE_FIREBASE_AUTH_DOMAIN` | `acme-grc.firebaseapp.com` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | `acme-grc` | Must equal the backend's `FIREBASE_PROJECT_ID`. `npm run validate:production` fails on a mismatch; left unchecked it surfaces only at sign-in, as `401 Firebase ID token is invalid: jwt audience invalid` |

Without these three the sign-in button logs a configuration error and does
nothing.

### Optional

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_ALLOWED_EMAIL_DOMAIN` | `example.com` | Singular. Passed to Google as the `hd` parameter to pre-filter the account chooser. **Restricts nothing** — the enforcing check is the backend's `ALLOWED_EMAIL_DOMAINS` |
| `VITE_AUTH_MODE` | `demo` | Frontend half of the demo bypass. Also requires `import.meta.env.DEV`, so it cannot be reached from a production build, which additionally throws at start-up if it is set |
| `VITE_API_URL` | `https://grc.yourcompany.com` | Absolute API base URL. Empty by default, which means same-origin through the gateway |
| `VITE_CONTROLS_API_URL` | `http://localhost:3001` | Overrides the controls-service base URL; falls back to `VITE_API_URL` |
| `VITE_WS_URL` | `ws://localhost:3001/ws` | WebSocket endpoint |
| `VITE_ENABLE_WEBSOCKET` | `true` | Enables the WebSocket connection |

### Error Tracking

Browser-side only; the API services do not report to Sentry.

```bash
VITE_ERROR_TRACKING_ENABLED=true      # off unless exactly "true"
VITE_SENTRY_DSN=https://xxx@sentry.io/456
VITE_APP_VERSION=1.0.0                # release tag
VITE_ENV=production                   # environment tag
```

### Module Enablement

Each module has a build-time deployment default, read by `ModuleContext`
(`frontend/src/contexts/ModuleContext.tsx`). A saved per-organization
configuration takes precedence over these.

| Module | Variable | Default |
|--------|----------|---------|
| Compliance | `VITE_ENABLE_COMPLIANCE_MODULE` | `true` |
| Data Management | `VITE_ENABLE_DATA_MODULE` | `true` |
| Risk | `VITE_ENABLE_RISK_MODULE` | `true` |
| TPRM | `VITE_ENABLE_TPRM_MODULE` | `true` |
| BC/DR | `VITE_ENABLE_BCDR_MODULE` | `true` |
| Audit | `VITE_ENABLE_AUDIT_MODULE` | `true` |
| Trust | `VITE_ENABLE_TRUST_MODULE` | `true` |
| People | `VITE_ENABLE_PEOPLE_MODULE` | `true` |
| AI Features | `VITE_ENABLE_AI_MODULE` | `false` |
| Tools & Reports | `VITE_ENABLE_TOOLS_MODULE` | `true` |
| Configuration as Code | `VITE_ENABLE_CONFIG_AS_CODE_MODULE` | `true` |

See [Module Configuration](./MODULE_CONFIGURATION.md) for the per-organization
layer.

---

## How the values reach the containers

Production uses one mechanism: `.env.prod`, passed explicitly.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

`docker-compose.prod.yml` interpolates those values into each service's
`environment:` block. **A service only ever sees the variables the compose
file explicitly names it.** Putting a variable in `.env.prod` is not enough:
if the compose file does not forward it to that service, the process never
sees it. Adding a new backend variable therefore means editing
`docker-compose.prod.yml` as well.

A running container keeps the environment it started with. After changing
`.env.prod`, recreate the containers rather than restarting them:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

`VITE_*` values are different again: they are compiled into the frontend
bundle at build time, so they need `--build frontend`, not a recreate.

---

## Environment Templates

### Development

```bash
NODE_ENV=development
DATABASE_URL=postgresql://grc:grc_secret@localhost:5433/gigachad_grc
AUTH_MODE=demo
STORAGE_TYPE=local
LOG_LEVEL=debug
```

`./scripts/start-demo.sh` sets this up; the only infrastructure containers it
starts are PostgreSQL and MinIO.

### Production

Start from `deploy/env.example` rather than this list — it is the file that
is kept in step with the compose file. The values that must be changed from
their shipped defaults are:

```bash
NODE_ENV=production
APP_DOMAIN=grc.yourcompany.com
ACME_EMAIL=ops@yourcompany.com

POSTGRES_PASSWORD=...
MINIO_ROOT_USER=...
MINIO_ROOT_PASSWORD=...

FIREBASE_PROJECT_ID=acme-grc
ALLOWED_EMAIL_DOMAINS=yourcompany.com
AUTH_AUTO_PROVISION=false
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=acme-grc.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=acme-grc

ENCRYPTION_KEY=...
CORS_ORIGINS=https://grc.yourcompany.com
```

---

## Generating Secrets

```bash
# ENCRYPTION_KEY - must be at least 32 characters
openssl rand -hex 32

# PostgreSQL and MinIO passwords
openssl rand -base64 32
```

---

## Validation

```bash
npm run validate:production          # reads .env.prod
npm run validate:production:strict   # also fails on warnings
```

The script checks that the required variables are present and non-empty,
that secrets are long enough and not left at a shipped placeholder, that
`AUTH_AUTO_PROVISION` has an organization to point at, that `CORS_ORIGINS`
is restricted, that `AUTH_MODE=demo` is not enabled in production, and that
`VITE_FIREBASE_PROJECT_ID` equals `FIREBASE_PROJECT_ID`. Run it before every
deployment.

---

## Handling Secrets

- Never commit `.env.prod`. Keep it `chmod 600` on the server.
- Store `ENCRYPTION_KEY` somewhere other than the server as well. It cannot
  be recovered from a database backup, and without it every stored
  integration and AI credential is unreadable.
- Use different credentials per environment.
- Rotate on a schedule: database and MinIO passwords semi-annually,
  third-party API keys annually. Rotating `ENCRYPTION_KEY`
  requires re-entering the credentials it protects.
