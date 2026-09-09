# GigaChad GRC - Production Deployment Guide

This comprehensive guide covers everything you need to deploy GigaChad GRC to a production environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Backend Services Deployment](#backend-services-deployment)
6. [Frontend Deployment](#frontend-deployment)
7. [Authentication Setup (Firebase)](#authentication-setup-firebase)
8. [SSL/TLS Configuration](#ssltls-configuration)
9. [Monitoring & Logging](#monitoring--logging)
10. [Security Checklist](#security-checklist)
11. [Troubleshooting](#troubleshooting)
12. [Maintenance & Updates](#maintenance--updates)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| Docker | 24.0+ | Container runtime |
| Docker Compose | 2.20+ | Multi-container orchestration |
| Node.js | 18.0+ | Frontend build |
| PostgreSQL | 15+ | Primary database |

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 50 GB SSD | 100+ GB SSD |
| Network | 100 Mbps | 1 Gbps |

### Domain & DNS

- Primary domain (e.g., `grc.yourcompany.com`)
- TLS certificate for the main app: `grc.yourcompany.com`. Traefik obtains
  one from Let's Encrypt automatically
- One `A` record is enough. There is **no auth subdomain** — identity comes
  from Firebase Authentication, which the browser talks to directly, and the
  API is served from the same host under `/api`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer / CDN                       │
│                    (Cloudflare, AWS ALB, etc.)                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Traefik Proxy                           │
│                    (SSL termination, ACME)                      │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│               nginx Gateway  (gateway/nginx.conf)               │
│         Single app entrypoint: SPA + 53 /api/* prefixes         │
└─────────────────────────────────────────────────────────────────┘
          │                       │
          ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │   API Services  │
│ (nginx, static) │     │   (NestJS x6)   │
└─────────────────┘     └─────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
          ┌─────────────────┐         ┌─────────────────┐
          │   PostgreSQL    │         │      MinIO      │
          └─────────────────┘         └─────────────────┘
```

**No authentication server runs in this deployment.** The browser obtains an
ID token from Firebase directly; each service verifies that token against
Google's public keys and then reads the caller's role and organization from
PostgreSQL. Nothing but Traefik publishes a port.

### Microservices

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | Static SPA, served by nginx inside the container |
| Controls | 3001 | Controls, Evidence, Dashboard, Risks |
| Frameworks | 3002 | Frameworks, Assessments, Mappings |
| Policies | 3004 | Policies, Document Management |
| TPRM | 3005 | Vendors, Contracts |
| Trust | 3006 | Questionnaires, Trust Center |
| Audit | 3007 | Audits, Findings |

The port numbers above are the complete set. All six API services expose `GET /health`;
controls additionally exposes `GET /api/system/health`. None of these ports is
published in production — they are reachable only on the internal Docker
network, through the gateway.

---

## Environment Configuration

### Production Environment File

`deploy/env.example` is the authoritative template — copy it rather than
retyping this:

```bash
cp deploy/env.example .env.prod
chmod 600 .env.prod
ln -s .env.prod .env     # docker compose reads .env by default
```

The values you must set:

```bash
# ===========================================
# General
# ===========================================
NODE_ENV=production
APP_DOMAIN=grc.yourcompany.com        # no scheme; Traefik routes on this
ACME_EMAIL=ops@yourcompany.com        # Let's Encrypt expiry warnings
LOG_LEVEL=info
TZ=UTC
IMAGE_TAG=latest

# ===========================================
# Database
# ===========================================
POSTGRES_USER=grc
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD   # openssl rand -base64 32
POSTGRES_DB=gigachad_grc
# The services build DATABASE_URL from the three values above inside
# docker-compose.prod.yml; set it explicitly only for an external database.

# ===========================================
# Authentication - Firebase Authentication (Google sign-in only)
# ===========================================
# The ID token proves IDENTITY ONLY. Role, permissions and organization are
# read from PostgreSQL on every request, never from token claims.

# Firebase console > Project settings > General > Project ID.
# Pins the accepted token issuer and audience; the guard will not start
# without it.
FIREBASE_PROJECT_ID=your-firebase-project-id

# Comma-separated email domain allowlist. A Firebase ID token carries no `hd`
# claim, so this is one of only two things restricting who can sign in.
ALLOWED_EMAIL_DOMAINS=yourcompany.com

# Leave false so a provisioned `users` row is required. If set true,
# AUTH_DEFAULT_ORG_ID is mandatory and new accounts become `viewer`.
AUTH_AUTO_PROVISION=false
# AUTH_DEFAULT_ORG_ID=

# AUTH_MODE=demo is the ONLY authentication bypass. The guard hard-throws
# when NODE_ENV=production. Never set it here.
# AUTH_MODE=

# Browser Firebase config (build-time; see "Frontend Environment" below).
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id

# ===========================================
# Object Storage (MinIO, in-stack)
# ===========================================
MINIO_ROOT_USER=grc-storage            # change from minioadmin
MINIO_ROOT_PASSWORD=YOUR_SECURE_PASSWORD
MINIO_BROWSER=off                      # keep the console off in production
MINIO_DOMAIN=storage.grc.yourcompany.com

# For AWS S3 instead of the bundled MinIO, set these on the service
# containers: STORAGE_TYPE=s3, S3_ENDPOINT, S3_PORT, S3_USE_SSL,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET.
# STORAGE_TYPE defaults to `local`; the MINIO_* names above take precedence
# over the S3_* aliases wherever both are read.

# ===========================================
# Security
# ===========================================
# Encrypts stored integration credentials. Losing it makes them unreadable.
ENCRYPTION_KEY=YOUR_GENERATED_KEY      # openssl rand -hex 32 (min 32 chars)

# Reserved for internal service-to-service tokens; nothing signs with it
# today, but the validation script requires a strong value.
JWT_SECRET=YOUR_GENERATED_SECRET       # openssl rand -base64 64

# Browser origins allowed to call the API. Scheme included, no trailing slash.
CORS_ORIGINS=https://grc.yourcompany.com

RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# ===========================================
# Notifications
# ===========================================
# `console` logs emails instead of sending them. SMTP/SendGrid/SES
# credentials for live delivery are configured in the application
# (Settings -> Notifications) and stored encrypted, not here.
EMAIL_PROVIDER=console
EMAIL_FROM=noreply@grc.yourcompany.com
EMAIL_FROM_NAME=GigaChad GRC

# Absolute base URL used in notification links.
APP_URL=https://grc.yourcompany.com

# ===========================================
# Backups
# ===========================================
BACKUP_RETENTION_DAYS=30

# ===========================================
# Proxy
# ===========================================
TRAEFIK_LOG_LEVEL=WARN
```

AI provider keys are **not** environment variables: they are entered in the
application (Settings → AI Configuration) and stored encrypted with
`ENCRYPTION_KEY`.

### Frontend Environment

Every `VITE_*` value is **build-time**: Vite compiles it into the JavaScript
bundle, so changing one requires rebuilding the `frontend` image rather than
restarting it.

`docker-compose.prod.yml` wires exactly three of them through to
`frontend/Dockerfile` as build arguments, read from `.env.prod`:

```bash
# The Web API key is a PUBLIC client identifier, not a secret: it ships in
# the browser bundle by design.
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
```

Those three are all the browser needs: the SPA and the API are served from
the same origin through the gateway, so no API URL has to be configured. To
set any other `VITE_*` value for a container build you must add it to both
the `frontend.build.args` block in `docker-compose.prod.yml` and the `ARG`/
`ENV` pair in `frontend/Dockerfile`. The optional ones are:

| Variable | Effect |
|----------|--------|
| `VITE_API_URL` | Absolute API base URL, if not same-origin |
| `VITE_ALLOWED_EMAIL_DOMAIN` | Google `hd` account-chooser hint. Restricts nothing — the real check is the backend's `ALLOWED_EMAIL_DOMAINS` |
| `VITE_ERROR_TRACKING_ENABLED`, `VITE_SENTRY_DSN`, `VITE_APP_VERSION`, `VITE_ENV` | Sentry error tracking |
| `VITE_ENABLE_*_MODULE` | Deployment default for each module; a saved per-organization configuration overrides it |

---

## Database Setup

### 1. Initialize PostgreSQL

```bash
# Run migrations in order
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/01-init.sql
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/02-soft-delete-migration.sql
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/03-database-enums.sql
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/04-junction-tables.sql
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/05-notification-configuration.sql
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/10-employee-compliance.sql
psql -h your-db-host -U grc_user -d gigachad_grc -f database/init/11-performance-indexes.sql
```

### 2. Run Prisma Migrations

```bash
# From each service directory
cd services/controls && npx prisma migrate deploy
cd ../frameworks && npx prisma migrate deploy
cd ../policies && npx prisma migrate deploy
cd ../tprm && npx prisma migrate deploy
cd ../trust && npx prisma migrate deploy
cd ../audit && npx prisma migrate deploy
```

### 3. Database Backup Script

Save as `scripts/backup-database.sh`:

```bash
#!/bin/bash
# Production Database Backup Script

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/gigachad_grc_${TIMESTAMP}.sql.gz"

# Create backup
pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB | gzip > $BACKUP_FILE

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_FILE s3://your-backup-bucket/postgres/

echo "Backup completed: $BACKUP_FILE"
```

---

## Backend Services Deployment

### Docker Compose Production

`docker-compose.prod.yml` already exists in the repository — do not write your
own. It defines:

| Service | Role |
|---------|------|
| `traefik` | TLS termination and Let's Encrypt (`ACME_EMAIL`), the only container publishing ports 80/443 |
| `gateway` | nginx, `gateway/nginx.conf`; the single public entrypoint for the app. Traefik routes `Host(${APP_DOMAIN})` here and nowhere else |
| `frontend` | The built SPA served by nginx on 3000 |
| `controls`, `frameworks`, `policies`, `tprm`, `trust`, `audit` | The six NestJS services |
| `postgres` | PostgreSQL, no published port |
| `minio` | Object storage. Also carries a Traefik router for `storage.${APP_DOMAIN}` (the S3 API only), which resolves only if you create that DNS record. There is no console router — `MINIO_BROWSER` defaults to `off` and port 9001 is not published |
| `backup-scheduler` | Periodic `pg_dump`, honouring `BACKUP_RETENTION_DAYS` |

Two networks: `grc-dmz`, shared by Traefik, the gateway and MinIO, and
`grc-network`, which is `internal: true` — so PostgreSQL and the six API
services are not reachable from outside the host at all. Every service
container is `read_only` with `no-new-privileges`, all capabilities dropped,
and a `GET /health` healthcheck that the gateway's `depends_on` waits for.

Because the gateway owns routing, individual API services carry no Traefik
`PathPrefix` labels. Adding an `/api/*` prefix means editing
`gateway/nginx.conf` **and** the Vite dev proxy in `frontend/vite.config.ts`
together — a prefix present in only one works in only one environment.

### Deployment Commands

```bash
# Build and start everything (first build takes 25-60 minutes on a small VM)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# View logs
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f

# Status
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

See [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md) for the full ordered
procedure, including applying the Prisma schema and creating the first
administrator.

---

## Frontend Deployment

### Build for Production

```bash
cd frontend

# Install dependencies
npm ci --production=false

# Build
npm run build

# The build output is in ./dist
```

### Nginx Configuration

Create `frontend/nginx.prod.conf`:

```nginx
server {
    listen 80;
    server_name grc.yourcompany.com;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://rsms.me; connect-src 'self' https://api.grc.yourcompany.com wss://grc.yourcompany.com https://*.sentry.io;" always;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache HTML
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (if not using separate domain)
    location /api/ {
        proxy_pass http://controls:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

---

## Authentication Setup (Firebase)

Identity is Firebase Authentication with Google sign-in. No authentication
server is deployed with the application, and there is no server-side identity
configuration in this repository to import.

### 1. Create the Firebase project

In the [Firebase console](https://console.firebase.google.com/):

1. **Add project**. Decline Google Analytics — it is not used.
2. **Build → Authentication → Get started**, then on the **Sign-in method**
   tab enable **Google** and set a public-facing name and support email.
   **Enable nothing else**: the backend rejects any token whose
   `sign_in_provider` is not `google.com`, so a second provider only produces
   confusing failures.
3. **Authentication → Settings → Authorized domains**: add
   `grc.yourcompany.com`. This names the web origins allowed to *complete* a
   sign-in — an anti-phishing check. It does not decide who may sign in.
4. **Project settings → General**: register a web app if **Your apps** is
   empty, then collect `Project ID`, `apiKey` and `authDomain` for
   `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_PROJECT_ID`.

**No user import.** Firebase does not need a copy of your staff list; anyone
with a Google account can obtain a token from your project. What makes someone
a user of *this application* is step 2 below.

### 2. Restrict who can sign in

A Firebase ID token carries no `hd` (hosted domain) claim, so nothing in the
token proves the holder belongs to your Workspace. Two server-side layers do:

| Layer | Variable | Behaviour |
|-------|----------|-----------|
| Email domain allowlist | `ALLOWED_EMAIL_DOMAINS` | Comma-separated. A mismatch is `403`. Empty disables the check — never in production |
| A provisioned `users` row | `AUTH_AUTO_PROVISION` (default `false`) | An address with no matching row is refused `401`, whatever domain it came from |

`VITE_ALLOWED_EMAIL_DOMAIN` (singular, frontend) restricts nothing — it only
pre-filters Google's account chooser.

`AUTH_AUTO_PROVISION=true` requires `AUTH_DEFAULT_ORG_ID`; the guard refuses
to start otherwise, and auto-provisioned accounts become `viewer`.

### 3. Create the first administrator

**Nothing creates the first account for you** — there is no invite email, no
self-registration and no first-run wizard. Until a `users` row exists every
request is refused with:

```
401  No account is provisioned for you@example.com. Ask an administrator to invite you.
```

Insert the organization and the administrator directly, after the schema has
been applied. You do not need the person's Firebase UID: insert a placeholder
`external_id` and the guard claims the row by verified email on first
sign-in, rewriting `external_id` to the real Firebase subject.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U grc -d gigachad_grc <<'SQL'
INSERT INTO organizations (id, name, slug, updated_at)
VALUES (gen_random_uuid(), 'Acme Corporation', 'acme', NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (
    id, external_id, email, first_name, last_name, display_name,
    role, status, organization_id, updated_at
)
SELECT
    gen_random_uuid(),
    'pending:jane.doe@example.com',   -- replaced on first sign-in
    'jane.doe@example.com',           -- MUST match the Google address exactly
    'Jane', 'Doe', 'Jane Doe',
    'admin', 'active',
    o.id, NOW()
FROM organizations o
WHERE o.slug = 'acme'
ON CONFLICT (external_id) DO NOTHING;
SQL
```

Set `role` explicitly: the Prisma schema defaults it to `viewer`, so omitting
it leaves the database describing your administrator as a viewer. Sign-in
works within 30 seconds — the guard caches a resolved identity for that long
and there is nothing to restart.

See [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator)
for the same procedure with the real Firebase UID instead of a placeholder.

---

## SSL/TLS Configuration

### Option 1: Let's Encrypt (Automatic)

Already configured in Traefik above. Certificates auto-renew.

### Option 2: Custom Certificate

```yaml
# In docker-compose.prod.yml, update traefik service:
traefik:
  volumes:
    - ./certs:/certs:ro
  command:
    - "--entrypoints.websecure.http.tls=true"
    - "--providers.file.directory=/certs"
    - "--providers.file.watch=true"
```

Create `certs/tls.yml`:

```yaml
tls:
  certificates:
    - certFile: /certs/grc.yourcompany.com.crt
      keyFile: /certs/grc.yourcompany.com.key
```

---

## Monitoring & Logging

### Sentry Error Tracking

1. Create a Sentry project at https://sentry.io
2. Get DSN from Project Settings > Client Keys
3. Set environment variables:

```bash
# Backend
SENTRY_DSN=https://xxx@sentry.io/123
SENTRY_ENVIRONMENT=production

# Frontend
VITE_SENTRY_DSN=https://yyy@sentry.io/456
VITE_ERROR_TRACKING_ENABLED=true
```

### Prometheus Metrics

Deploy the monitoring stack:

```bash
cd deploy/monitoring
docker compose -f docker-compose.monitoring.yml up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)
- AlertManager: http://localhost:9093

### Log Aggregation

Logs are shipped to Loki via Promtail. View in Grafana:
1. Add Loki as data source: http://loki:3100
2. Use LogQL to query: `{container_name="grc-controls"}`

---

## Security Checklist

### Pre-Deployment

- [ ] Change all default passwords
- [ ] Generate new JWT_SECRET: `openssl rand -base64 64`
- [ ] Generate new ENCRYPTION_KEY: `openssl rand -hex 32` (min 32 chars)
- [ ] `FIREBASE_PROJECT_ID` set; Google is the only enabled sign-in method
- [ ] `ALLOWED_EMAIL_DOMAINS` set — never empty in production
- [ ] `AUTH_MODE` unset, and `AUTH_AUTO_PROVISION=false` unless
      `AUTH_DEFAULT_ORG_ID` is also set
- [ ] `npm run validate:production` passes
- [ ] Review and update CORS settings (`CORS_ORIGINS`)
- [ ] Enable rate limiting
- [ ] Configure firewall rules (only 22, 80, 443 need to be open)
- [ ] Set up WAF if available

### Post-Deployment

- [ ] Verify SSL/TLS configuration (https://ssllabs.com/ssltest)
- [ ] Test authentication flow
- [ ] Verify error tracking is working
- [ ] Run security scan (OWASP ZAP)
- [ ] Test backup and restore procedure
- [ ] Document recovery procedures

### Ongoing

- [ ] Regular dependency updates
- [ ] Monitor security advisories
- [ ] Review access logs
- [ ] Rotate secrets quarterly
- [ ] Penetration testing annually

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

```bash
# Check PostgreSQL is running
docker exec grc-postgres pg_isready

# Check connection string
docker exec grc-controls env | grep DATABASE_URL

# Test connection
docker exec grc-controls npx prisma db pull
```

#### 2. Authentication Not Working

```bash
# Is the project id the services expect the one your tokens come from?
docker exec grc-controls env | grep FIREBASE_PROJECT_ID

# Are the two restriction layers set as intended?
docker exec grc-controls env | grep -E 'ALLOWED_EMAIL_DOMAINS|AUTH_AUTO_PROVISION|AUTH_MODE'

# Does the person have a users row, and is it active?
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres psql -U grc -d gigachad_grc \
  -c "SELECT email, role, status, external_id FROM users;"
```

Read the error message — each rejection names its own cause:

| Response | Meaning |
|----------|---------|
| `401 No account is provisioned for <email>` | Token verified; no `users` row. Insert one, or set `AUTH_AUTO_PROVISION=true` |
| `403 Email domain "<d>" is not permitted` | `ALLOWED_EMAIL_DOMAINS` does not include that domain |
| `401 Sign-in provider "<p>" is not accepted` | A provider other than Google is enabled in Firebase |
| `401 Token email address is not verified` | The Google account has no verified address |
| `403 This account is <status>` | The `users` row exists but is not `active` |
| `401 Firebase ID token is invalid: ... audience` | The bundle was built with a different `VITE_FIREBASE_PROJECT_ID` than the backend's `FIREBASE_PROJECT_ID` |

If the browser never gets a token at all, check that the app's hostname is in
Firebase → Authentication → Settings → Authorized domains, and that the
`frontend` image was rebuilt after any `VITE_FIREBASE_*` change — those are
compiled into the bundle.

#### 3. API Requests Failing

```bash
# Check service health
curl -s https://grc.yourcompany.com/api/system/health

# Check Traefik routing
docker logs grc-traefik | grep error

# Check service logs
docker logs grc-controls --tail 100
```

#### 4. Performance Issues

```bash
# Check database performance
docker exec grc-postgres psql -U grc_user -d gigachad_grc -c "
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;"

# Check memory usage
docker stats
```

### Log Locations

| Service | Container Log | Application Log |
|---------|--------------|-----------------|
| Controls | `docker logs grc-controls` | `/app/logs/` |
| Frontend | `docker logs grc-frontend` | Nginx access/error logs |
| Database | `docker logs grc-postgres` | PostgreSQL logs |
| Traefik | `docker logs grc-traefik` | Access logs |

---

## Maintenance & Updates

### Update Procedure

```bash
# 1. Backup database
./scripts/backup-database.sh

# 2. Pull latest code
git pull origin main

# 3. Build new images
docker compose -f docker-compose.prod.yml build --no-cache

# 4. Run migrations
docker exec grc-controls npx prisma migrate deploy

# 5. Deploy with minimal downtime
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 6. Verify health
curl -s https://grc.yourcompany.com/api/health

# 7. Monitor logs for errors
docker compose -f docker-compose.prod.yml logs -f --tail 100
```

### Rollback Procedure

```bash
# 1. Stop current deployment
docker compose -f docker-compose.prod.yml stop

# 2. Restore database from backup
./scripts/restore-database.sh /backups/postgres/latest.sql.gz

# 3. Checkout previous version
git checkout v1.x.x  # previous working version

# 4. Rebuild and deploy
docker compose -f docker-compose.prod.yml up -d --build

# 5. Verify rollback
curl -s https://grc.yourcompany.com/api/system/health
```

### Health Monitoring Script

Save as `scripts/health-check.sh`:

```bash
#!/bin/bash
# Production Health Check Script

# /healthz is the gateway's own liveness route; /api/system/health is the
# controls service's aggregate check, reached through the gateway.
ENDPOINTS=(
    "https://grc.yourcompany.com/healthz"
    "https://grc.yourcompany.com/api/system/health"
)

SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

for endpoint in "${ENDPOINTS[@]}"; do
    response=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" --max-time 10)
    
    if [ "$response" != "200" ]; then
        message="🚨 Health check failed for $endpoint (HTTP $response)"
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK"
    fi
done
```

Add to crontab:
```bash
*/5 * * * * /path/to/scripts/health-check.sh
```

---

## Support

For issues or questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review logs: `docker compose logs -f`
3. Check [GitHub Issues](https://github.com/your-org/gigachad-grc/issues)
4. Contact: support@yourcompany.com

---

*Last updated: December 2024*

