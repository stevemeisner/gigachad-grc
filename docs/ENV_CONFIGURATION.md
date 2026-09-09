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
# Full connection string (preferred)
DATABASE_URL=postgresql://grc_user:grc_password@localhost:5432/gigachad_grc

# Or individual components (for docker-compose)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=grc_user
POSTGRES_PASSWORD=grc_password
POSTGRES_DB=gigachad_grc

# Connection pooling (optional)
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_POOL_IDLE_TIMEOUT=10000
```

### Authentication (Keycloak)

```bash
# Keycloak server
KEYCLOAK_URL=http://localhost:8080

# Realm and client
KEYCLOAK_REALM=gigachad-grc
KEYCLOAK_CLIENT_ID=grc-backend
KEYCLOAK_CLIENT_SECRET=secret-from-keycloak
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

Each microservice runs on a specific port:

| Service | Port | Environment Variable |
|---------|------|---------------------|
| Controls | 3001 | `CONTROLS_PORT` |
| Frameworks | 3002 | `FRAMEWORKS_PORT` |
| Policies | 3004 | `POLICIES_PORT` |
| TPRM | 3005 | `TPRM_PORT` |
| Trust | 3006 | `TRUST_PORT` |
| Audit | 3007 | `AUDIT_PORT` |

---

## Frontend Configuration

All frontend variables must be prefixed with `VITE_` to be exposed to the browser.

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `https://grc.yourcompany.com` | Backend API URL |
| `VITE_KEYCLOAK_URL` | `https://auth.yourcompany.com` | Keycloak server |
| `VITE_KEYCLOAK_REALM` | `gigachad-grc` | Keycloak realm |
| `VITE_KEYCLOAK_CLIENT_ID` | `grc-frontend` | Public client ID |

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

### Feature Flags

```bash
# Enable AI-powered features
VITE_ENABLE_AI_FEATURES=false

# Enable MCP server integration
VITE_ENABLE_MCP_SERVERS=false

# Enable various modules
VITE_ENABLE_TRUST_CENTER=true
VITE_ENABLE_EMPLOYEE_COMPLIANCE=true
VITE_ENABLE_QUESTIONNAIRES=true
```

### Development Options

```bash
# Enable dev authentication bypass
# ⚠️ NEVER enable in production!
VITE_ENABLE_DEV_AUTH=false

# Log level
VITE_LOG_LEVEL=info  # debug | info | warn | error
```

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
      - DATABASE_URL=postgresql://grc_user:secret@postgres:5432/gigachad_grc
      - NODE_ENV=production
```

### Option 3: env_file directive

```yaml
services:
  controls:
    env_file:
      - .env
      - .env.production
```

---

## Environment Templates

### Development (.env.development)

```bash
NODE_ENV=development
DATABASE_URL=postgresql://grc_user:grc_password@localhost:5432/gigachad_grc
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=gigachad-grc
KEYCLOAK_CLIENT_ID=grc-backend
STORAGE_PROVIDER=local
LOG_LEVEL=debug
```

### Production (.env.production)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://grc_user:SECURE_PASSWORD@db.yourcompany.com:5432/gigachad_grc
KEYCLOAK_URL=https://auth.yourcompany.com
KEYCLOAK_REALM=gigachad-grc
KEYCLOAK_CLIENT_ID=grc-backend
KEYCLOAK_CLIENT_SECRET=YOUR_SECRET
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

# Session Secret
openssl rand -hex 32

# PostgreSQL Password
openssl rand -base64 24 | tr -d '=+/'
```

---

## Validation

Before deploying, validate your configuration:

```bash
# Check required variables are set
./deploy/preflight-check.sh

# Or manually check
[ -z "$DATABASE_URL" ] && echo "❌ DATABASE_URL not set" || echo "✓ DATABASE_URL"
[ -z "$JWT_SECRET" ] && echo "❌ JWT_SECRET not set" || echo "✓ JWT_SECRET"
# ... etc
```

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

