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

> **Note:** If an organization has a saved module configuration, it takes precedence
> over the defaults above for that organization.

---

## Environment Variables

### Quick Reference

Copy `deploy/env.example` to `.env` and configure:

```bash
cp deploy/env.example .env
chmod 600 .env  # Restrict permissions
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
| `DATABASE_POOL_MIN` | No | `5` | Minimum pool connections |
| `DATABASE_POOL_MAX` | No | `20` | Maximum pool connections |

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
| `JWT_SECRET` | Yes | - | JWT signing secret (min 64 chars) |
| `CORS_ORIGINS` | No | - | Allowed CORS origins (comma-separated) |

**Generate JWT Secret**:
```bash
openssl rand -base64 64 | tr -d '\n'
```

#### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | No | `true` | Enable rate limiting |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Window duration (ms) |

#### TLS/SSL (Let's Encrypt)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACME_EMAIL` | Yes | - | Email for certificate notifications |

#### API Gateway (Traefik)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRAEFIK_LOG_LEVEL` | No | `WARN` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` |

#### Email/SMTP (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | - | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASSWORD` | No | - | SMTP password |
| `SMTP_FROM` | No | - | From address |
| `SMTP_SECURE` | No | `true` | Use TLS |

#### Monitoring (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `METRICS_ENABLED` | No | `false` | Enable Prometheus metrics |
| `METRICS_PORT` | No | `9090` | Metrics port |
| `SENTRY_DSN` | No | - | Sentry error tracking DSN |

#### AI Configuration (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_PROVIDER` | No | `disabled` | AI provider: `openai`, `anthropic`, `disabled` |
| `OPENAI_API_KEY` | No | - | OpenAI API key (starts with `sk-`) |
| `OPENAI_MODEL` | No | `gpt-5` | OpenAI model: `gpt-5`, `gpt-5-mini`, `o3`, `o3-mini`, `gpt-4o` |
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key (starts with `sk-ant-`) |
| `ANTHROPIC_MODEL` | No | `claude-opus-4-5-20250514` | Anthropic model: `claude-opus-4-5-20250514`, `claude-sonnet-4-20250514`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022` |
| `AI_TEMPERATURE` | No | `0.3` | AI response temperature (0-2) |
| `AI_MAX_TOKENS` | No | `4096` | Maximum tokens for AI responses |

**AI Features** (enable/disable in UI at Settings → AI Configuration):
- Risk Scoring - AI-suggested risk likelihood and impact
- Auto-Categorization - Automatic categorization and tagging
- Smart Search - Natural language search across all modules
- Policy Drafting - Generate policy drafts from requirements
- Control Suggestions - Recommend controls for risks

#### MCP Server Configuration (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_ENABLED` | No | `false` | Enable MCP server integration |
| `MCP_EVIDENCE_SERVER` | No | - | Path to GRC Evidence Collection MCP server |
| `MCP_COMPLIANCE_SERVER` | No | - | Path to GRC Compliance Automation MCP server |
| `MCP_AI_ASSISTANT_SERVER` | No | - | Path to GRC AI Assistant MCP server |
| `GITHUB_TOKEN` | No | - | GitHub token for MCP GitHub evidence collection |
| `OKTA_ORG_URL` | No | - | Okta org URL for MCP Okta evidence collection |
| `OKTA_API_TOKEN` | No | - | Okta API token for MCP Okta evidence collection |
| `AZURE_SUBSCRIPTION_ID` | No | - | Azure subscription ID for MCP Azure evidence |

**MCP Servers Available**:
- **grc-evidence** - Automated evidence collection from AWS, Azure, GitHub, Okta, Google Workspace, Jamf
- **grc-compliance** - Compliance automation for SOC 2, ISO 27001, HIPAA, GDPR checks
- **grc-ai-assistant** - AI-powered risk analysis, control suggestions, policy drafting

#### Backup Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKUP_RETENTION_DAYS` | No | `30` | Backup retention period |
| `BACKUP_S3_BUCKET` | No | - | S3 bucket for backups |
| `BACKUP_S3_REGION` | No | - | S3 region |
| `BACKUP_S3_ACCESS_KEY` | No | - | S3 access key |
| `BACKUP_S3_SECRET_KEY` | No | - | S3 secret key |

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
  JWT_SECRET: ${JWT_SECRET}
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
| `JWT_SECRET` | Reserved for internal service-to-service tokens |
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

### Security Headers Middleware

```yaml
# Add to dynamic configuration
http:
  middlewares:
    security-headers:
      headers:
        frameDeny: true
        sslRedirect: true
        browserXssFilter: true
        contentTypeNosniff: true
        stsIncludeSubdomains: true
        stsPreload: true
        stsSeconds: 31536000
        customFrameOptionsValue: "SAMEORIGIN"
        referrerPolicy: "strict-origin-when-cross-origin"
        contentSecurityPolicy: "default-src 'self'"
```

---

## Database Configuration

### PostgreSQL Settings

#### `postgresql.conf` Optimizations

```ini
# Memory
shared_buffers = 256MB                # 25% of RAM for dedicated server
effective_cache_size = 768MB          # 75% of RAM
work_mem = 16MB                       # Per-operation memory
maintenance_work_mem = 128MB          # For VACUUM, CREATE INDEX

# Connections
max_connections = 200
superuser_reserved_connections = 3

# WAL
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB

# Logging
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'ddl'
log_min_duration_statement = 1000     # Log queries > 1s

# Checkpoints
checkpoint_completion_target = 0.9
checkpoint_timeout = 10min

# Autovacuum
autovacuum = on
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
```

#### Connection Pooling (PgBouncer)

```ini
[databases]
gigachad_grc = host=postgres port=5432 dbname=gigachad_grc

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
```

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

### Bucket Setup

```bash
# Create buckets
mc alias set grc http://localhost:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD}
mc mb grc/evidence
mc mb grc/policies
mc mb grc/integrations

# Set bucket policies
mc policy set download grc/evidence
mc policy set private grc/policies
```

### Lifecycle Rules

```json
{
  "Rules": [
    {
      "ID": "evidence-retention",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "evidence/"
      },
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

---

## Security Configuration

### TLS/SSL

Generate self-signed certificates (development):

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/CN=localhost"
```

### Secrets Management

Using Docker secrets:

```yaml
secrets:
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt

services:
  controls:
    secrets:
      - db_password
      - jwt_secret
    environment:
      DATABASE_URL_FILE: /run/secrets/db_password
```

### Network Policies

```yaml
# Kubernetes NetworkPolicy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: grc-services
spec:
  podSelector:
    matchLabels:
      app: grc
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: traefik
      ports:
        - protocol: TCP
          port: 3001
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
```

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

### Validate Environment

```bash
# Environment values: required variables, secret strength, and that
# AUTH_MODE=demo is not enabled in production. Reads .env.prod.
npm run validate:production

# Deployment prerequisites: tooling, Docker daemon, disk space, host ports
# 80/443, and the presence of the config files a deploy needs.
./deploy/preflight-check.sh

# Validate specific service
docker compose config --services
docker compose config | grep -A5 controls
```

### Test Connectivity

```bash
# Database
docker exec grc-controls nc -zv postgres 5432

# Service health (every service exposes GET /health)
docker exec grc-controls wget -qO- http://localhost:3001/health

# Aggregate health, controls service only
docker exec grc-controls wget -qO- http://localhost:3001/api/system/health
```


