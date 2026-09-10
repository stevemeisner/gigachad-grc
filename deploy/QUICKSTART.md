# Production Deployment Quick Start

A condensed command reference for someone who has deployed this application
before. If this is the first time, follow
[docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md) instead — it is
the authoritative procedure and explains what each step is for.

Every compose command needs `--env-file .env.prod`. There is no `.env` in a
production deployment, so a command without it will fail to interpolate
`APP_DOMAIN`, the database password and everything else.

---

## 1. Clone and configure

```bash
cd /opt
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc

cp deploy/env.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

Set, at minimum:

- `APP_DOMAIN`, `ACME_EMAIL`, `CORS_ORIGINS`
- `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `ENCRYPTION_KEY`
- `FIREBASE_PROJECT_ID`, `ALLOWED_EMAIL_DOMAINS`
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID` — build-time; changing one later means
  rebuilding the frontend image
- leave `AUTH_MODE` unset

Generate the secrets:

```bash
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 32   # MINIO_ROOT_PASSWORD
openssl rand -hex 32      # ENCRYPTION_KEY  (must be >= 32 characters)
```

Keep a copy of `ENCRYPTION_KEY` somewhere other than this server. It cannot
be recovered from a database backup, and without it every stored integration
credential is unreadable.

## 2. Validate

```bash
npm run validate:production
```

## 3. Start the database, then apply the schema

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres
docker compose -f docker-compose.prod.yml --env-file .env.prod ps postgres   # wait for healthy
```

The schema is applied with `prisma db push` from a throwaway container on the
same network — see
[Deployment Runbook §7.2](../docs/DEPLOYMENT-RUNBOOK.md#72-apply-the-schema)
for the exact commands. Do not use `prisma migrate deploy`, and ignore
`deploy/db-migrate.sh`: this repository ships no baseline migration, so there
is nothing for it to apply.

## 4. Build and start everything

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

The first build takes 25-60 minutes on a small VM.

## 5. Create the first administrator

Nothing creates it for you. Signing in with Google proves identity; it grants
nothing until a `users` row exists. The SQL is in
[Deployment Runbook §6](../docs/DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator).

## 6. Verify

```bash
curl -fsS https://your-domain.com/healthz             # gateway liveness
curl -fsS https://your-domain.com/api/system/health   # controls service health
```

Then sign in through the browser.

---

## Daily operations

```bash
# Logs
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f controls
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=100 controls

# Status
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# Health of one service, from inside the network
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T gateway wget -qO- http://controls:3001/health

# Restart
docker compose -f docker-compose.prod.yml --env-file .env.prod restart controls

# Rebuild one service without touching the rest
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --build controls
```

## Backup and restore

```bash
# Take a backup: PostgreSQL dump plus the MinIO data, archived together.
./deploy/backup.sh                       # default /backups/gigachad-grc
./deploy/verify-backup.sh                # check an archive is intact

# Restore. This stops the stack and discards current data - back up first.
./deploy/restore.sh /backups/gigachad-grc/backup-YYYY-MM-DD-HHMMSS.tar.gz
```

The `backup-scheduler` container already runs `deploy/backup.sh` on a
schedule (`deploy/cron/backup-crontab`) and prunes archives older than
`BACKUP_RETENTION_DAYS`. Add a host crontab entry only if you have disabled
that container.

Copy archives off the machine. A backup on the disk you are backing up is
not a backup.

## Troubleshooting

```bash
# Services will not start: read the logs, then check the host.
docker compose -f docker-compose.prod.yml --env-file .env.prod logs
df -h
free -h
```

The gateway waits for the frontend and all six services to report healthy. If
it stays in `created`, one of its dependencies is unhealthy — look there.

```bash
# Database
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres pg_isready -U grc
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  psql -U grc -d gigachad_grc -c "SELECT * FROM pg_stat_activity;"

# Certificates
docker compose -f docker-compose.prod.yml --env-file .env.prod logs traefik | grep -i certificate
dig +short your-domain.com
openssl s_client -connect your-domain.com:443 </dev/null

# Resource usage
docker stats --no-stream
docker system df
```

Sign-in failures each carry their own message and cause;
[Deployment Runbook §8](../docs/DEPLOYMENT-RUNBOOK.md#8-verify-sign-in-end-to-end)
maps every one of them.

## Maintenance

```bash
# Update
./deploy/backup.sh
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Database housekeeping
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  vacuumdb -U grc -d gigachad_grc --analyze
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  psql -U grc -d gigachad_grc -c "SELECT pg_size_pretty(pg_database_size('gigachad_grc'));"
```

### Reclaiming disk

```bash
docker image prune -f        # dangling images only
find /backups/gigachad-grc/ -name 'backup-*.tar.gz' -mtime +30 -delete
```

> Never run `docker system prune --volumes` on this host. The database and
> the object store live in Docker volumes (`postgres_data`, `minio_data`);
> that command deletes them.

## Endpoints

| What | URL |
|---|---|
| Application | `https://your-domain.com` |
| Gateway liveness | `https://your-domain.com/healthz` |
| Application health | `https://your-domain.com/api/system/health` |
| S3 API (MinIO) | `https://storage.your-domain.com`, only if you created that DNS record |
| Per-service health | `GET /health` on 3001, 3002, 3004, 3005, 3006, 3007 — internal network only |

Sign-in is Firebase Authentication with Google, hosted by Google: there is no
authentication host of your own to monitor. The MinIO console is disabled and
unrouted by default (`MINIO_BROWSER=off`); reach it by SSH tunnel if you must,
as described in [README.md](./README.md).

---

For the full procedure see
[docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md); for what is in
this directory see [README.md](./README.md).
