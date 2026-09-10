# System Health & Production Readiness

The GigaChad GRC platform includes comprehensive system health monitoring and production readiness checks to ensure your deployment is secure and resilient.

## Overview

System health features are accessible to administrators in **Settings > Organization Settings**, at the bottom of the page under "System Health."

## System Health Banner

The System Health Banner displays critical warnings at the top of the admin
dashboard. It renders whatever `GET /api/system/warnings` returns — every check
whose status is `warning` or `critical`. The checks are defined in
`services/controls/src/system/system-health.service.ts`; nineteen run on every
request, grouped into six categories.

### Security (`security-*`)
- **`security-auth-mode`** — Authentication Mode. `AUTH_MODE=demo` skips token
  verification. Combined with `NODE_ENV=production` this is **critical**;
  outside production it is a warning. Anything else reports "Using Firebase
  authentication."
- **`security-default-passwords`** — Default Passwords. Trips when
  `POSTGRES_PASSWORD` or `MINIO_ROOT_PASSWORD` is empty or one of the known
  defaults (`password`, `grc_secret`, `minioadmin`, `admin`); critical in
  production, a warning elsewhere.
- **`security-encryption-key`** — Encryption Key. `ENCRYPTION_KEY` missing or
  shorter than 32 characters; critical in production.

### Authentication (`auth-*`)
- **`auth-firebase-config`** — Firebase Configuration. Healthy when
  `FIREBASE_PROJECT_ID` is set, or when `AUTH_MODE=demo` (reported as "tokens
  are not verified (development only)"). Neither one set is critical in
  production, a warning elsewhere.
- **`auth-domain-allowlist`** — Email Domain Allowlist. A Firebase ID token
  carries no hosted-domain claim, so `ALLOWED_EMAIL_DOMAINS` is what stops any
  Google account from signing in. Unset is a warning in production.

There is no check for a token-signing secret, because the application holds
none: sign-in is Firebase, and its RS256 ID tokens are verified against
Google's JWKS with the issuer and audience pinned to `FIREBASE_PROJECT_ID`.

### Backup Configuration (`backup-*`)
- **`backup-script-exists`** — warns when `deploy/backup.sh` cannot be found.
- **`backup-remote-config`** — warns unless `DR_REMOTE_BACKUP_ENABLED=true` and
  `DR_REMOTE_BACKUP_S3_BUCKET` is set.
- **`backup-retention`** — `BACKUP_RETENTION_DAYS` (default 30). Under 30 days
  is a warning; under 7 days is critical.

### Database (`database-*`)
- **`database-connectivity`** — runs `SELECT 1`; critical on failure.
- **`database-ssl`** — warns unless `DATABASE_URL` contains `sslmode=require`
  or `ssl=true`.
- **`database-pool`** — reports the Prisma pool settings
  (`DATABASE_CONNECTION_LIMIT`, `DATABASE_POOL_TIMEOUT`); informational only.

### Storage (`storage-*`)
- **`storage-minio-config`** — warns unless `MINIO_ENDPOINT` and
  `MINIO_ACCESS_KEY` (or `MINIO_ROOT_USER`) are both set.
- **`storage-ssl`** — warns unless `MINIO_USE_SSL=true`.

### Configuration (`config-*`)
- **`config-node-env`** — reports `NODE_ENV`; informational only.
- **`config-cors`** — warns when `CORS_ORIGINS` is `*` in production.
- **`config-rate-limit`** — warns when `RATE_LIMIT_ENABLED=false` in production.
- **`config-logging`** — warns when `LOG_LEVEL=debug` in production.

## Production Readiness Score

The Production Readiness widget calls `GET /api/system/production-readiness`.
The score is `(healthy + warnings × 0.5) / total × 100`, rounded — so warnings
cost half a check and critical findings cost a whole one. `ready` is true only
when no check is critical.

### Score Interpretation
- **80-100 (Green)**: Production ready
- **60-79 (Yellow)**: Some warnings to address
- **0-59 (Red)**: Critical issues must be resolved

### Categories Checked
The same six categories the health checks emit:

1. **Security** — auth mode, default passwords, encryption key
2. **Authentication** — Firebase project, email domain allowlist
3. **Backup** — script presence, remote backup, retention
4. **Database** — connectivity, SSL, pool settings
5. **Storage** — MinIO/S3 configuration and SSL
6. **Configuration** — `NODE_ENV`, CORS, rate limiting, log level

## Setup Wizard

The Setup Wizard reports whether each piece of essential configuration is in
place. It **checks** state; it does not change anything.

1. **Database Connection** — PostgreSQL is reachable
2. **Encryption Key** — `ENCRYPTION_KEY` is set and long enough
3. **Admin User** — at least one admin `users` row exists
4. **Organization** — at least one organization exists
5. **Authentication** — satisfied by `FIREBASE_PROJECT_ID`, or by
   `AUTH_MODE=demo` for local development
6. **Backup Configuration** — remote backup is enabled

> The wizard's own instructions for step 3 name a seed command
> (`npm run seed:admin`) that does not exist in this repository, and suggest
> `AUTH_AUTO_PROVISION=true`, which creates a **viewer**, not an
> administrator. Create the first administrator with the SQL in
> [Deployment Runbook §6](../../DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator)
> instead.

The wizard can be opened at any time from Settings to review configuration
status.

## CLI Validation Script

For CI/CD pipelines and deployment automation, use the validation script:

```bash
# Basic validation
npm run validate:production

# Strict mode (fail on warnings)
npm run validate:production:strict
```

### Exit Codes
- **0**: All checks passed
- **1**: Critical errors found (blocks deployment)
- **2**: Warnings found (only in strict mode)

### What it prints

The script walks a series of sections — Environment Configuration, Security
Configuration, Authentication, Database Configuration, Object Storage,
Backup Configuration, Network Configuration, Monitoring & Logging, Email
Delivery, File System, Host Prerequisites — marking each finding pass, warn
or fail, and closes with a summary:

```
━━━ Security Configuration ━━━
✓ ENCRYPTION_KEY is properly configured
✓ All passwords have been changed from defaults

━━━ Backup Configuration ━━━
✓ Backup script exists
⚠ Remote backup is not enabled
✓ Backup retention is 30 days

  Passed:   12
  Warnings: 2
  Errors:   0

  Production Readiness Score: 92/100
```

With warnings and no errors the script exits 0 unless `--strict` was passed.
It scores the same way the in-app widget does: a warning is worth half a
check, an error nothing.

## Scheduled backups

The `backup-scheduler` container in `docker-compose.prod.yml` runs
`deploy/backup.sh` on the schedule in `deploy/cron/backup-crontab` — a daily
backup, pruned according to `BACKUP_RETENTION_DAYS`. It is part of the
production stack and needs no configuration beyond that variable.

## API Endpoints

### GET /api/system/health
Basic health check (no authentication required).

### GET /api/system/health/detailed
Comprehensive health check with all system checks (admin only).

### GET /api/system/warnings
Active warnings for dashboard display (admin only).

### GET /api/system/production-readiness
Production readiness score and recommendations (admin only).

### GET /api/system/setup/status
Setup wizard progress status (admin only).

### GET /api/system/backup/status
Backup configuration status (admin only).

### GET /health
Every service (controls 3001, frameworks 3002, policies 3004, tprm 3005, trust
3006, audit 3007) exposes an unauthenticated `GET /health` from the shared
`HealthController` for load-balancer and container probes. The
`/api/system/*` routes above are served by the controls service only.

## Best Practices

1. **Run validation before every deployment**
   ```bash
   npm run validate:production:strict
   ```

2. **Address all critical issues immediately**
   - Never deploy with ERRORS in the validation output
   - Review warnings and create tickets to address them

3. **Send backups off the machine**
   ```bash
   DR_REMOTE_BACKUP_ENABLED=true
   DR_REMOTE_BACKUP_S3_BUCKET=your-backup-bucket
   DR_REMOTE_BACKUP_REGION=us-east-1
   ```
   The `backup-scheduler` container already takes them; the variables above
   copy each archive to S3 so it does not sit on the disk being backed up.

4. **Monitor the health banner daily**
   - Check for new warnings after configuration changes
   - Don't dismiss critical warnings without resolution

5. **Test disaster recovery regularly**
   - Run the restore script in a staging environment
   - Verify backup integrity monthly

## Troubleshooting

### "ENCRYPTION_KEY is not set"
Generate a secure key:
```bash
openssl rand -hex 32
```
Add to your `.env.prod` file.

### "CRITICAL: Using development authentication in production!"
`AUTH_MODE=demo` is set while `NODE_ENV=production`. The demo bypass skips
Firebase token verification entirely and `FirebaseAuthGuard` refuses to start
in that combination. Fix it by:
- Unsetting `AUTH_MODE` (or setting it to anything other than `demo`)
- Setting `FIREBASE_PROJECT_ID` to the Firebase project that issues your ID
  tokens
- Setting `ALLOWED_EMAIL_DOMAINS` to your company domain

### "FIREBASE_PROJECT_ID is not set"
The API cannot verify Google ID tokens without it. Set it to the Firebase
project id (Firebase console > Project settings).

### "No email domain restriction configured"
A Firebase ID token carries no hosted-domain claim, so without an allowlist any
Google account can present a valid token. Set the allowlist:
```bash
ALLOWED_EMAIL_DOMAINS=yourcompany.com
```

### "Remote backup is not configured"
Configure S3/MinIO for offsite backups:
```bash
DR_REMOTE_BACKUP_ENABLED=true
DR_REMOTE_BACKUP_S3_BUCKET=my-backup-bucket
DR_REMOTE_BACKUP_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

### "Database SSL is not enabled"
Add SSL to your DATABASE_URL:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

