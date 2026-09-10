# deploy/

Deployment assets for a single-server production install, plus the
operational procedures that belong to them.

**The deployment procedure itself is
[docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md)** — numbered,
start to finish, written for someone who has never deployed this
application. This file does not repeat it. Use
[QUICKSTART.md](./QUICKSTART.md) for a condensed command list once you have
done it before.

## What is in this directory

| File | Purpose |
|---|---|
| `env.example` | The environment template. Copy to `.env.prod` in the repository root |
| `backup.sh` | Dumps PostgreSQL, copies the MinIO data, archives both. `npm run backup` runs it |
| `verify-backup.sh` | Checks an archive is intact |
| `restore.sh` | Stops the stack, restores PostgreSQL and MinIO from an archive, brings it back up |
| `cron/backup-crontab` | Schedule used by the `backup-scheduler` container |
| `Dockerfile.backup-scheduler` | Builds the `backup-scheduler` image. It writes its own entrypoint and runs `crond` |
| `docker-entrypoint.sh` | **Unused.** No Dockerfile or compose file references it. It waits for PostgreSQL and runs `prisma migrate deploy`, neither of which happens in this deployment, and the `AUTO_MIGRATE` / `WAIT_FOR_DB` / `AUTO_BACKUP_*` variables it reads therefore have no effect |
| `monitoring/` | Optional Prometheus / Grafana / Loki / Alertmanager stack, started separately |
| `db-migrate.sh` | **Do not use.** It calls `prisma migrate deploy`, and this repository ships no baseline migration, so it has nothing to apply and swallows the error. The schema is applied with `prisma db push` |

Related documents:

- [docs/HOSTING-REQUIREMENTS.md](../docs/HOSTING-REQUIREMENTS.md) — what to
  buy, and what it costs
- [docs/PRODUCTION_DEPLOYMENT.md](../docs/PRODUCTION_DEPLOYMENT.md) —
  architecture and reference
- [docs/CONFIGURATION.md](../docs/CONFIGURATION.md),
  [docs/ENV_CONFIGURATION.md](../docs/ENV_CONFIGURATION.md) — every variable
- [docs/SECURITY_MODEL.md](../docs/SECURITY_MODEL.md) — authentication and
  authorization design
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) — go-live checklist

## The environment file

There is exactly one production environment file: **`.env.prod`** in the
repository root, copied from `deploy/env.example`.

```bash
cp deploy/env.example .env.prod
chmod 600 .env.prod
```

`docker-compose.prod.yml` is always run with `--env-file .env.prod`;
`backup.sh`, `restore.sh` and `scripts/validate-production.sh` read the same
file, and the compose file mounts it into the backup scheduler. Validate it
before deploying:

```bash
npm run validate:production
```

## Firebase Authentication

There is no identity server to install. Firebase Authentication is a hosted
Google service, and Google sign-in is the only accepted method.

1. In the [Firebase console](https://console.firebase.google.com), create a
   project and note its **Project ID** — this is `FIREBASE_PROJECT_ID`, and
   it pins the issuer and audience of every accepted token.
2. **Authentication → Sign-in method**: enable **Google**, and nothing else.
   The guard rejects any token whose `sign_in_provider` is not `google.com`.
3. **Authentication → Settings → Authorized domains**: add your production
   host. Sign-in from any other origin fails before the application is
   involved.
4. **Project settings → General → Your apps**: register a Web app and copy
   its config into `.env.prod` as `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_PROJECT_ID`. These are
   build-time values: the frontend image must be rebuilt after a change. The
   Web API key is a public client identifier, not a secret.
5. Set `ALLOWED_EMAIL_DOMAINS` to the domains permitted to sign in. A
   Firebase ID token carries no hosted-domain claim, so that allowlist plus
   the requirement that a `users` row exist are the only access controls.
6. Leave `AUTH_MODE` unset. Enforce 2-Step Verification on the Google
   accounts themselves, in Google Workspace — this application holds no
   password to protect.

**Nothing creates the first administrator for you.** There is no invite
email, no self-registration and no first-run wizard. Signing in with Google
proves who you are; until a `users` row exists every request is rejected.
Insert the first row following
[Deployment Runbook §6](../docs/DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator).

## MinIO

The MinIO **console is disabled and not routed** — it is an object-store
admin UI with no business on the public internet. `MINIO_BROWSER` defaults to
`off` and there is no Traefik router for it. Only the S3 API is published, on
`https://storage.<APP_DOMAIN>`, because the browser fetches evidence from
there through presigned URLs.

The application uses one bucket, named by `MINIO_BUCKET` (or `S3_BUCKET`) and
defaulting to `grc-storage`. Nothing creates it automatically:

```bash
# Substitute the project's network name; `docker network ls | grep grc-dmz`.
docker run --rm --network gigachad-grc_grc-dmz \
  -e MC_HOST_local="http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@minio:9000" \
  minio/mc mb --ignore-existing local/grc-storage
```

Keep the bucket private; the application issues presigned URLs rather than
making objects public.

To reach the console deliberately:

```bash
# 1. Set MINIO_BROWSER=on in .env.prod, then restart just minio
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d minio

# 2. From your workstation, tunnel to the container's console port
#    (9001 is not published on the host)
ssh -L 9001:$(ssh HOST "docker inspect -f \
  '{{.NetworkSettings.Networks.grc-dmz.IPAddress}}' grc-minio"):9001 HOST

# 3. Open http://localhost:9001 and log in with MINIO_ROOT_USER /
#    MINIO_ROOT_PASSWORD. Set MINIO_BROWSER back to off when finished.
```

## Backup and recovery

An archive contains the PostgreSQL dump and the MinIO object data.

```bash
./deploy/backup.sh                    # default /backups/gigachad-grc
./deploy/backup.sh /mnt/backups       # or an explicit directory
./deploy/verify-backup.sh             # check an archive is intact
```

The `backup-scheduler` container in `docker-compose.prod.yml` already runs
the same script on the schedule in `cron/backup-crontab` and prunes archives
older than `BACKUP_RETENTION_DAYS`. Add a host crontab entry only if you have
disabled that container.

Restore — this stops the stack and discards current data, so take a fresh
backup first:

```bash
./deploy/restore.sh /backups/gigachad-grc/backup-YYYY-MM-DD-HHMMSS.tar.gz
```

Send archives off the machine. A backup on the disk you are backing up is not
a backup:

```bash
DR_REMOTE_BACKUP_ENABLED=true
DR_REMOTE_BACKUP_S3_BUCKET=grc-backups-remote
DR_REMOTE_BACKUP_REGION=us-east-1
```

> `ENCRYPTION_KEY` is not recoverable from a backup. Store it separately, or
> the encrypted integration credentials in a restored database are
> unreadable.

## Monitoring and logs

Container logs are the primary source, and rotation is configured in the
compose file (10 MB per file, 3 files per service):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f controls
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 -t
docker inspect --format='{{json .State.Health}}' grc-postgres | jq
```

The optional metrics stack:

```bash
docker compose -f deploy/monitoring/docker-compose.monitoring.yml up -d
```

Only the **controls** service exposes Prometheus metrics today
(`controls:3001/metrics` — `collectors_runs_total`,
`scheduled_notifications_runs_total`, `mcp_workflow_executions_total`),
alongside MinIO, cAdvisor and node-exporter. The other five services expose
`GET /health`, which returns JSON for a container healthcheck and is not a
metrics endpoint; scraping it would report the target as permanently down.
Jobs for them are present but commented out in `monitoring/prometheus.yml`,
each with its reason.

Grafana's provisioning directory (`monitoring/grafana/provisioning`) is
mounted but does not exist in the repository — create it before starting the
stack, or Grafana comes up with no data source.

The monitoring stack publishes its own host ports (Prometheus 9090, Grafana
3030, Loki 3100, Alertmanager 9093, cAdvisor 8081, node-exporter 9100). Do
not open them in the firewall; reach them over an SSH tunnel.

No error-tracking SDK is wired into the services: there is no Sentry
initialisation in any `main.ts` and no `SENTRY_*` variable is read by the
backend. Error visibility comes from the container logs and the audit log.
(The integrations catalogue includes a Sentry connector, but that collects
compliance evidence from a customer's Sentry account — it does not
instrument this platform.)

## Certificates

Traefik obtains and renews a Let's Encrypt certificate automatically and
stores it in the `traefik_letsencrypt` volume. Port 80 must stay open for the
HTTP-01 challenge.

```bash
# Diagnose
docker compose -f docker-compose.prod.yml --env-file .env.prod logs traefik | grep -i certificate
dig +short your-domain.com
openssl s_client -connect your-domain.com:443 </dev/null

# Force a fresh issuance (rate limits apply: 5 duplicate certificates per week)
docker compose -f docker-compose.prod.yml --env-file .env.prod down
docker volume rm gigachad-grc_traefik_letsencrypt
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

To use your own certificate instead, see
[docs/SSL_CONFIGURATION.md](../docs/SSL_CONFIGURATION.md).

## Maintenance

```bash
# Update
./deploy/backup.sh
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# One service only
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --build controls

# Database housekeeping (substitute your POSTGRES_USER / POSTGRES_DB)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  vacuumdb -U grc -d gigachad_grc --analyze
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  reindexdb -U grc -d gigachad_grc
```

Rollback is [Deployment Runbook §10](../docs/DEPLOYMENT-RUNBOOK.md#10-rollback).

## Security practices for the host

- SSH keys only; disable password authentication. Firewall open on 22, 80
  and 443 and nothing else
- Keep `ALLOWED_EMAIL_DOMAINS` tight and leave `AUTH_AUTO_PROVISION=false`,
  so an administrator provisions each user deliberately
- Grant permission groups and per-user overrides rather than the `admin`
  role
- Rotate the database and MinIO passwords on a schedule.
  Rotating `ENCRYPTION_KEY` means re-entering every stored integration
  credential
- Patch the host and rebuild images regularly; the base images are pinned by
  tag, not digest
- Test a restore somewhere other than production before you need one
