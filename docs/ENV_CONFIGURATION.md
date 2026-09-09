# GigaChad GRC - Environment Configuration Reference

Complete reference for all environment variables used across the platform.

## Quick Setup

For local development, most defaults work out of the box. For production, see [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md).

---

## Backend Services

All backend services share common environment variables:

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | PostgreSQL connection string |
| `NODE_ENV` | `development` \| `production` | Environment mode |

### Database Configuration

```bash
# The services read DATABASE_URL and nothing else. Inside Docker the host is
# the `postgres` service on 5432; from the host it is localhost:5433, because
# docker-compose.yml publishes 5433 to avoid clashing with a local PostgreSQL.
DATABASE_URL=postgresql://grc:grc_secret@localhost:5433/gigachad_grc

# Used by the postgres container itself (docker-compose.yml), not by the
# services.
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

```bash
# Production
FIREBASE_PROJECT_ID=acme-grc
ALLOWED_EMAIL_DOMAINS=example.com
AUTH_AUTO_PROVISION=false

# Local demo only — never in production
# AUTH_MODE=demo
```

### File Storage

```bash
# Local storage (development)
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads

# S3 storage (production)
STORAGE_PROVIDER=s3
S3_BUCKET=grc-files
S3_REGION=us-east-1
S3_ACCESS_KEY=AKIA...
S3_SECRET_KEY=secret
S3_ENDPOINT=  # Leave empty for AWS, set for MinIO
```

### Email

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@yourcompany.com
SMTP_PASSWORD=app-password
SMTP_FROM=GigaChad GRC <notifications@yourcompany.com>
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
```

### Error Tracking

```bash
SENTRY_DSN=https://xxx@sentry.io/123
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.2
```

### Security

```bash
# JWT secret for internal auth (generate: openssl rand -base64 32)
JWT_SECRET=your-secret-here

# Encryption key for sensitive data
ENCRYPTION_KEY=your-encryption-key

# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# CORS
CORS_ORIGINS=https://grc.yourcompany.com,https://www.yourcompany.com
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

Infrastructure: PostgreSQL on 5433 locally, MinIO on 9000 (API) and 9001
(console). In production nothing but 80/443 is published — the nginx gateway
(`gateway/nginx.conf`) is the single public entrypoint and the services share
an internal Docker network.

Every service exposes `GET /health`; controls additionally exposes
`GET /api/system/health`.

---

## Frontend Configuration

All frontend variables must be prefixed with `VITE_` to be exposed to the browser.

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `https://grc.yourcompany.com` | Backend API base URL |
| `VITE_FIREBASE_API_KEY` | `AIza...` | Firebase Web API key. A **public** client identifier, not a secret — it ships in the browser bundle by design |
| `VITE_FIREBASE_AUTH_DOMAIN` | `acme-grc.firebaseapp.com` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | `acme-grc` | Must match the backend's `FIREBASE_PROJECT_ID` |

All three `VITE_FIREBASE_*` values are **build-time** inputs: `frontend/Dockerfile`
takes them as build arguments and Vite compiles them into the bundle, so
changing one requires rebuilding the image rather than restarting it.

### Optional Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_ALLOWED_EMAIL_DOMAIN` | `example.com` | Singular. Passed to Google as the `hd` parameter to pre-filter the account chooser. **Restricts nothing** — the real check is the backend's `ALLOWED_EMAIL_DOMAINS` |
| `VITE_AUTH_MODE` | `demo` | Frontend half of the demo bypass. Also requires `import.meta.env.DEV`, so it cannot be reached from a production build |
| `VITE_CONTROLS_API_URL` | `http://localhost:3001` | Overrides the controls-service base URL; falls back to `VITE_API_URL` |
| `VITE_WS_URL` | `ws://localhost:3001/ws` | WebSocket endpoint |
| `VITE_ENABLE_WEBSOCKET` | `true` | Enables the WebSocket connection |

### Error Tracking

```bash
# Enable Sentry (install @sentry/react first)
VITE_ERROR_TRACKING_ENABLED=true
VITE_SENTRY_DSN=https://xxx@sentry.io/456

# App version for release tracking
VITE_APP_VERSION=1.0.0

# Environment tag
VITE_ENV=production
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

## Docker Compose Configuration

When using Docker Compose, environment variables can be set:

### Option 1: .env file in project root

```bash
# .env
DATABASE_URL=postgresql://grc_user:secret@postgres:5432/gigachad_grc
NODE_ENV=production
```

### Option 2: environment section in docker-compose.yml

```yaml
services:
  controls:
    environment:
      - DATABASE_URL=postgresql://grc:secret@postgres:5432/gigachad_grc
      - NODE_ENV=production
```

### Option 3: env_file directive

```yaml
services:
  controls:
    env_file:
      - .env
      - .env.prod
```

---

## Environment Templates

The shipped template is `deploy/env.example`; copy it to `.env.prod` for a
production deployment (see [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md)).

### Development

```bash
NODE_ENV=development
DATABASE_URL=postgresql://grc:grc_secret@localhost:5433/gigachad_grc
AUTH_MODE=demo
STORAGE_PROVIDER=local
LOG_LEVEL=debug
```

`./scripts/start-demo.sh` sets this up for you; the only infrastructure
containers it starts are PostgreSQL and MinIO.

### Production

```bash
NODE_ENV=production
DATABASE_URL=postgresql://grc:SECURE_PASSWORD@db.yourcompany.com:5432/gigachad_grc

# Authentication — AUTH_MODE stays unset
FIREBASE_PROJECT_ID=acme-grc
ALLOWED_EMAIL_DOMAINS=yourcompany.com
AUTH_AUTO_PROVISION=false
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=acme-grc.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=acme-grc

STORAGE_PROVIDER=s3
S3_BUCKET=grc-files
S3_REGION=us-east-1
S3_ACCESS_KEY=AKIA...
S3_SECRET_KEY=...
SENTRY_DSN=https://...@sentry.io/...
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=notifications@yourcompany.com
SMTP_PASSWORD=...
JWT_SECRET=GENERATE_NEW_SECRET
ENCRYPTION_KEY=GENERATE_NEW_KEY
CORS_ORIGINS=https://grc.yourcompany.com
RATE_LIMIT_ENABLED=true
LOG_LEVEL=info
```

---

## Generating Secrets

Always generate fresh secrets for production:

```bash
# JWT Secret
openssl rand -base64 32

# Encryption Key
openssl rand -base64 32

# PostgreSQL Password
openssl rand -base64 24 | tr -d '=+/'
```

---

## Validation

Before deploying, validate your configuration. Both scripts read `.env.prod`
in preference to `.env`, and they check different things — run both:

```bash
# Environment values: required variables present and non-empty, secret
# strength, AUTH_AUTO_PROVISION/AUTH_DEFAULT_ORG_ID consistency, and that
# AUTH_MODE=demo is not enabled in production.
npm run validate:production

# Fail on warnings as well as errors
npm run validate:production:strict

# Deployment prerequisites: tooling (docker, compose, git, curl), the Docker
# daemon, disk space, host ports 80/443, and the presence of the config files
# a deploy needs (docker-compose.prod.yml, gateway/nginx.conf, the seven
# Dockerfiles). Also re-checks the required variables and refuses any
# remaining CHANGE_ME placeholder.
./deploy/preflight-check.sh
```

Both fail if `VITE_FIREBASE_PROJECT_ID` does not equal
`FIREBASE_PROJECT_ID`: the bundle is built from the `VITE_*` values, so a
mismatch produces a frontend whose tokens the backend will always reject.

---

## Security Best Practices

1. **Never commit secrets to git**
   - Use `.env.local` for local overrides
   - Add `*.env*` to `.gitignore`

2. **Use secret management in production**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Kubernetes Secrets

3. **Rotate secrets regularly**
   - JWT_SECRET: Quarterly
   - Database passwords: Semi-annually
   - API keys: Annually

4. **Limit access**
   - Use different credentials per environment
   - Principle of least privilege

---

*Last updated: December 2024*

