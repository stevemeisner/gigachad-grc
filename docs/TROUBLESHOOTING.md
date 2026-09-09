# GigaChad GRC Troubleshooting Guide

This guide covers common issues you may encounter and how to resolve them.

## Table of Contents

1. [Where the Logs Are](#where-the-logs-are)
2. [Initial Setup Issues](#initial-setup-issues)
3. [Authentication Problems](#authentication-problems)
4. [Database Issues](#database-issues)
5. [Demo Data Issues](#demo-data-issues)
6. [Frontend Issues](#frontend-issues)
7. [API/Backend Issues](#apibackend-issues)

---

## Where the Logs Are

`./scripts/start-demo.sh` runs the six NestJS services and the Vite dev server
on the host, redirecting each one to its own file under `.demo/logs/`:

| File | Contents |
|------|----------|
| `.demo/logs/<service>.log` | one per service: `controls`, `frameworks`, `policies`, `tprm`, `trust`, `audit` |
| `.demo/logs/frontend.log` | Vite dev server |
| `.demo/logs/build-shared.log`, `.demo/logs/build-<service>.log` | compiler output from the build step |

```bash
tail -f .demo/logs/controls.log
tail -30 .demo/logs/frontend.log
grep -i error .demo/logs/*.log
```

Infrastructure (PostgreSQL, MinIO) runs in Docker, so those logs come from
Compose:

```bash
docker compose ps
docker compose logs postgres
docker compose logs -f minio
```

---

## Initial Setup Issues

### "Cannot find module" errors when starting services

**Symptom:** Services fail to start with module not found errors.

**Solution:**

This is an npm workspaces repo: the six services, `services/shared` and
`frontend` all resolve from the root `node_modules`. Install once from the
project root rather than per service:

```bash
npm install
```

`./scripts/start-demo.sh` does this automatically when `node_modules` is
missing. If a service still cannot resolve `@gigachad-grc/shared`, build the
shared package first — services import its compiled output:

```bash
npm run build:shared
```

### "Ports already in use" from start-demo.sh

**Symptom:** Startup stops in step 1 with `Ports already in use: 3001 5433`.

**Cause:** Something is already listening on a port the demo needs — usually a
previous run that was killed instead of stopped, or a locally installed
PostgreSQL. Note that the demo deliberately publishes PostgreSQL on **5433**
rather than the default 5432 so it cannot clash with a system install; a
conflict on that port therefore means another copy of this stack is running.

**Solution:**

1. Stop a previous run properly:
```bash
./scripts/stop-demo.sh
```

2. Otherwise identify the owner of each reported port and stop it:
```bash
lsof -nP -iTCP:5433 -sTCP:LISTEN
```

3. Ports the demo requires:

| Port | Used by |
|------|---------|
| 3000 | frontend (Vite dev server) |
| 3001 / 3002 / 3004 / 3005 / 3006 / 3007 | controls / frameworks / policies / tprm / trust / audit |
| 5433 | PostgreSQL (container port 5432) |
| 9000 / 9001 | MinIO API / console |

Nothing runs on 3003 — that port belongs to Grafana in `docker-compose.yml`,
which the demo does not start (neither do Traefik or Prometheus).

### Database schema is missing, or applying it fails

**Symptom:** Services start but every query fails, or Prisma cannot apply the
schema.

**Cause:** The schema for all 129 models lives in
`services/shared/prisma/schema.prisma` and is applied with `prisma db push`.
The repository ships **no baseline migration** (`services/shared/prisma/migrations`
contains only the incremental `20251208_add_workspaces`), so
`prisma migrate deploy` and `prisma migrate reset` cannot build the database
and must not be used.

**Solution:**

1. Make sure PostgreSQL is up:
```bash
docker compose up -d postgres
docker compose logs postgres
```

2. Push the schema from the project root:
```bash
npm run db:push
```

3. For a hard reset, drop the volumes and start over — this recreates the
   schema and the development bootstrap rows:
```bash
./scripts/stop-demo.sh --clean
./scripts/start-demo.sh
```

### Services can't connect to database

**Symptom:** "Connection refused" or "ECONNREFUSED" errors.

**Solution:**

1. Check the container is running:
```bash
docker compose ps postgres
```

2. Verify `DATABASE_URL`. The services run on the host, so they reach
   PostgreSQL on the published port **5433**, not 5432:
```bash
grep '^DATABASE_URL' .env
# postgresql://grc:<password>@localhost:5433/gigachad_grc
```

3. Test the connection with the credentials from `.env` (`POSTGRES_USER`,
   `POSTGRES_PASSWORD`, `POSTGRES_DB`):
```bash
docker compose exec postgres psql -U grc -d gigachad_grc -c "SELECT 1"
```

4. Only containerised services address PostgreSQL by hostname: inside the
   Compose network the host is `postgres` and the port is 5432.
```bash
docker network inspect gigachad-grc_grc-network
```

---

## Authentication Problems

> **The local demo runs with `AUTH_MODE=demo`.** That is the single auth
> bypass in the system: `FirebaseAuthGuard`
> (`services/shared/src/auth/firebase-auth.guard.ts`) skips Firebase ID-token
> verification and serves every request as the seeded demo admin
> (`john.doe@example.com`, `external_id` = `demo-user`). It still resolves that
> identity from PostgreSQL through the same code path a real Google sign-in
> uses, and it refuses to start when `NODE_ENV=production`. Keep the demo bound
> to loopback and never expose it to a network.

### Services refuse to start: "AUTH_MODE=demo" and production

**Symptom:** Every service exits during boot, or `start-demo.sh` reports that a
port never opened. The service log contains a message about `AUTH_MODE=demo`
not being permitted with `NODE_ENV=production`.

**Cause:** `FirebaseAuthGuard` asserts this in its constructor, so the failure
happens at boot rather than on the first request. `.env` was seeded from a
production template (`deploy/env.example` sets `NODE_ENV=production`).

**Solution:**

```bash
grep '^NODE_ENV' .env      # must be development
mv .env .env.production.bak && cp env.development .env
```

`./scripts/start-demo.sh` refuses to start against a `.env` that sets
`NODE_ENV=production`. Use `env.development` for local work.

### The "Dev Login (Skip SSO)" button is missing

**Symptom:** The login page offers only *Sign in with Google*.

**Cause:** `frontend/src/contexts/AuthContext.tsx` gates the demo button on
`import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'demo'`. Your `.env`
predates that variable, or the dev server was started before it was added.

**Solution:**

```bash
grep '^VITE_AUTH_MODE' .env    # expect: VITE_AUTH_MODE=demo
```

`env.development` sets it. If your `.env` is an older copy, add the line and
restart the dev server — Vite reads `.env` only at startup. In a production
build the branch is dead code regardless: Vite compiles `import.meta.env.DEV`
to `false`.

### Signed in with Google but every request is 401 or 403

**Symptom:** Google sign-in succeeds, then the API rejects the session.

**Cause:** The Firebase ID token proves identity only. Further checks run in
`FirebaseAuthGuard` after the signature verifies, each with its own status code
and message:

| Response | Meaning | Fix |
|---|---|---|
| **401** "No account is provisioned for &lt;email&gt;" | No `users` row matches the token's `sub` or its email, and `AUTH_AUTO_PROVISION` is not `true` | Insert the row (see the [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator)) |
| **403** "Email domain … is not permitted" | The address is outside `ALLOWED_EMAIL_DOMAINS` | Add the domain to that variable and restart the services |
| **403** "This account is … and cannot be used to sign in" | The `users` row exists but `status` is not `active` | `UPDATE users SET status = 'active' WHERE email = '…';` |
| **401** "Sign-in provider … is not accepted" | The token came from a provider other than Google | Only Google sign-in is accepted |
| **401** "Firebase ID token has expired" | Clock skew, or a token cached in the browser | Reload the page to force a token refresh |

A verified identity is cached for 30 seconds, so a database fix can take that
long to take effect.

### Google sign-in itself fails, or the popup is blocked

**Symptom:** The Google popup closes with an error, or reports an unauthorized
domain.

**Solution:**

1. Confirm the browser build has Firebase configuration. The three values are
   compiled into the bundle, so a change needs a rebuild:
```bash
grep -E '^VITE_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID)' .env
```

2. The origin you loaded the app on must be listed in the Firebase console
   under **Authentication → Settings → Authorized domains**. That list controls
   which origins may complete a sign-in; it does not decide *who* may sign in.

3. Use `http://localhost:3000`, not `http://127.0.0.1:3000`: `CORS_ORIGINS` in
   `env.development` lists the former, and the two are different origins to
   both the browser and Firebase.

4. The Firebase Web API key is a **public** client identifier, not a secret.
   A leaked key is not the cause of a sign-in failure.

---

## Database Issues

### "Relation does not exist"

**Symptom:** Queries fail with "relation X does not exist".

**Cause:** Either the Prisma schema was never pushed to this database, or the
PostgreSQL volume was created by an older, broken run. The scripts in
`database/init/` are **not** the fix: they are legacy incremental patches
against Prisma-owned tables, they are no longer mounted into the container, and
running them by hand against an empty database fails with exactly this error.

**Solution:**

1. Push the schema from the project root:
```bash
npm run db:push
```

2. Confirm the tables exist — everything lives in the `public` schema, one
   table per Prisma model:
```bash
docker compose exec postgres psql -U grc -d gigachad_grc -c "\dt"
```

3. If the database is still empty or half-built, discard the volume and let the
   startup script rebuild it:
```bash
./scripts/stop-demo.sh --clean
./scripts/start-demo.sh
```

### `prisma db push` refuses: "The database contains tables Prisma does not manage"

**Cause:** A postgres volume created by an older revision of this project. The
identity server that used to run beside the app kept ~90 of its own tables in
the same `public` schema Prisma owns; it has been removed entirely, but a
pre-existing volume still holds those tables and `db push` offers to drop them
rather than continue.

**Solution:** recreate the volume — this deletes local demo data only.

```bash
./scripts/stop-demo.sh --clean && ./scripts/start-demo.sh
```

### PostgreSQL restarts in a loop, or the database has no tables

**Symptom:** `docker compose ps` shows `grc-postgres` restarting, or it reports
healthy but `\dt` lists nothing and every service logs
`relation "..." does not exist`.

**Cause:** `database/init/*.sql` used to be mounted into
`/docker-entrypoint-initdb.d`. Those files are incremental patches that `ALTER`
tables Prisma owns, so on a fresh volume the first one
(`02-soft-delete-migration.sql`) fails with `relation "controls" does not
exist`; because PostgreSQL runs init scripts with `ON_ERROR_STOP=1`, that
aborts initialisation and leaves a table-less database behind. The mount has
been removed and `prisma db push` creates the schema instead, but a volume
created by an older run preserves the broken state.

**Solution:**

```bash
./scripts/stop-demo.sh --clean   # drops the postgres and minio volumes
./scripts/start-demo.sh
```

Treat `database/init/` as legacy: nothing applies it, and it must not be run by
hand.

---

## Demo Data Issues

### Demo data did not load, or the seeder returns 500

**Symptom:** The app is up but every list is empty, `start-demo.sh` reports
that demo data could not be loaded, or `POST /api/seed/load-demo` answers
HTTP 500.

**Cause:** In development every controller authenticates through
`AUTH_MODE=demo`, which resolves the one seeded organization and user. The seeder
writes rows that reference both, so when those two rows are missing Prisma
fails with `P2025` ("Record to update not found").
`database/dev-bootstrap.sql` inserts them, and `start-demo.sh` applies it right
after the schema push.

**Solution:**

1. Apply the bootstrap rows (safe to repeat), then retry the load:
```bash
docker compose exec -T postgres psql -U grc -d gigachad_grc \
  < database/dev-bootstrap.sql
curl -X POST http://localhost:3001/api/seed/load-demo
```

2. Read what the controls service actually reported:
```bash
tail -50 .demo/logs/controls.log
```

3. A successful load creates roughly 1,000 records: 3 frameworks
   (SOC 2 Type II, ISO 27001:2022, HIPAA), 276 framework requirements,
   49 controls with one implementation each, 20 evidence items, 15 policies,
   20 vendors, 25 risks, 50 employees, 37 assets, 10 integrations and 5 audits.
   Control mappings, evidence links, vendor assessments, training records and
   background checks are randomised per run, so the grand total moves by a few
   dozen records each time. Confirm with:
```bash
curl -s http://localhost:3001/api/seed/status
```

Other responses from this endpoint:

| Status | Meaning |
|--------|---------|
| 409 | The organization already holds data — reset it before reloading |
| 429 | Throttled. Each service allows 5 req/s, 30 req/10s and 100 req/min (`ThrottlerModule.forRoot` in `services/controls/src/app.module.ts`). Wait a minute and retry once — do not loop |
| 500 | Missing bootstrap rows (above), or `NODE_ENV=production` in `.env` — see *Dev login not working* |

The same load is available in the UI at **Settings → Organization → Demo
Data**, which is also where you reset it.

---

## Frontend Issues

### Vite started on a different port, or the page is blank

**Symptom:** `http://localhost:3000` does not answer, the dev server reports a
different port, or the page loads white with module errors in the console.

**Cause:** Vite normally falls back to the next free port when 3000 is taken,
which silently breaks `CORS_ORIGINS` and any configured Firebase Authorized
domain. The demo now passes
`--strictPort`, so it fails loudly instead. A blank page after dependencies
changed usually means a stale `frontend/node_modules/.vite` cache.

**Solution:**

1. Check what the dev server said:
```bash
tail -30 .demo/logs/frontend.log
```

2. If port 3000 is occupied, free it (see *"Ports already in use" from
   start-demo.sh*):
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

3. Clear the Vite cache and build output, then start again:
```bash
./scripts/stop-demo.sh --purge
./scripts/start-demo.sh
```

4. Always open `http://localhost:3000` — `127.0.0.1:3000` is a different
   origin, and it is not in `CORS_ORIGINS`.

### "Failed to fetch" errors

**Symptom:** Network requests fail in browser.

**Solution:**

1. In development `VITE_API_URL` is intentionally **empty**: the Vite dev
   server proxies every `/api/*` path to the service that owns it, so the app
   uses relative URLs and CORS never applies. Only production builds set an
   absolute API URL.
```bash
grep '^VITE_API_URL' .env
```

2. If one area of the UI fails while the rest works, a service is down rather
   than misconfigured — see *One page works but another tab errors* under
   API/Backend Issues.

3. The proxy table lives in `frontend/vite.config.ts`. Each prefix has its own
   target, so not everything goes to 3001:
```typescript
// frontend/vite.config.ts
server: {
  proxy: {
    '/api/controls': { target: 'http://localhost:3001', changeOrigin: true },
    '/api/policies': { target: 'http://localhost:3004', changeOrigin: true },
    '/api/vendors':  { target: 'http://localhost:3005', changeOrigin: true },
    // ...one entry per route prefix
  }
}
```

---

## API/Backend Issues

### One page works but another tab errors

**Symptom:** The dashboard loads, but (say) Vendors or Audits shows a fetch
error. Some `/api/*` calls succeed while others fail.

**Cause:** Each area of the UI is served by a different NestJS process on its
own port, and the Vite dev server proxies `/api/*` to whichever one owns the
route. If one process died, only its routes break.

| Service | Port | Log | Route prefixes it owns |
|---------|------|-----|------------------------|
| controls | 3001 | `.demo/logs/controls.log` | `/api/controls`, `/api/evidence`, `/api/implementations`, `/api/dashboard(s)`, `/api/comments`, `/api/tasks`, `/api/integrations`, `/api/notifications`, `/api/users`, `/api/permissions`, `/api/risks`, `/api/assets`, `/api/risk-config`, `/api/risk-scenarios`, `/api/seed`, `/api/employee-compliance`, `/api/training`, `/api/ai`, `/api/mcp`, `/api/system`, `/api/bulk`, `/api/modules`, `/api/config-as-code`, `/api/workspaces`, `/api/frameworks/catalog`, `/api/audit` |
| frameworks | 3002 | `.demo/logs/frameworks.log` | `/api/frameworks`, `/api/assessments`, `/api/mappings` |
| policies | 3004 | `.demo/logs/policies.log` | `/api/policies` |
| tprm | 3005 | `.demo/logs/tprm.log` | `/api/vendors`, `/api/contracts`, `/api/vendor-assessments`, `/api/tprm-config` |
| trust | 3006 | `.demo/logs/trust.log` | `/api/questionnaires`, `/api/knowledge-base`, `/api/trust-center`, `/api/trust-config`, `/api/answer-templates`, `/api/trust-ai` |
| audit | 3007 | `.demo/logs/audit.log` | `/api/audits`, `/api/audit-requests`, `/api/findings`, `/api/audit/templates`, `/api/audit/workpapers`, `/api/audit/test-procedures`, `/api/audit/remediation`, `/api/audit/analytics`, `/api/audit/planning`, `/api/audit/reports` |

Evidence is served by **controls**, not by a service of its own, and nothing
listens on 3003. The authoritative mapping is the proxy table in
`frontend/vite.config.ts`.

**Solution:**

1. Find the missing listener:
```bash
for p in 3001 3002 3004 3005 3006 3007; do
  lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null && echo "$p up" || echo "$p DOWN"
done
```

2. Read that service's log for the crash:
```bash
tail -50 .demo/logs/tprm.log
```

3. Restart the stack:
```bash
./scripts/stop-demo.sh && ./scripts/start-demo.sh
```

All six services wire the shared health module, so each answers `GET /health`
(plus `/health/live` and `/health/ready`) on its own port. The controls service
additionally serves the richer, unauthenticated
`GET http://localhost:3001/api/system/health`, which returns
`{"status":"healthy",...}` with database detail:

```bash
for p in 3001 3002 3004 3005 3006 3007; do
  printf '%s ' "$p"; curl -sf "http://localhost:$p/health" >/dev/null \
    && echo ok || echo FAIL
done
```

### Service won't start

**Symptom:** `npm run start` fails for a service.

**Solution:**

1. Check all dependencies installed:
```bash
npm install
```

2. Verify TypeScript compiles:
```bash
npm run build:services   # builds services/shared, then all six services
```

3. Check for port conflicts:
```bash
lsof -i :3001  # Check if port is in use
```

4. Read the log the startup script captured, or run the service in the
   foreground to watch it fail:
```bash
tail -50 .demo/logs/controls.log
cd services/controls && npm run start:dev
```

### Rate limiting / 429 errors

**Symptom:** Too many requests error.

**Solution:**

1. Each service allows 5 requests/second, 30 per 10 seconds and 100 per minute.
   The tiers are hard-coded in `ThrottlerModule.forRoot([...])` in each
   service's `app.module.ts` (for example
   `services/controls/src/app.module.ts`); the `RATE_LIMIT_*` variables in
   `env.development` are not read by the throttler, so change the module if you
   need different limits.

2. For batch operations, add delays:
```typescript
for (const item of items) {
  await api.post('/controls', item);
  await new Promise(r => setTimeout(r, 100)); // 100ms delay
}
```

### File upload fails

**Symptom:** Evidence uploads fail.

**Solution:**

1. Check file size limits:
```typescript
// In service
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}))
```

2. Verify storage is configured. `STORAGE_TYPE` selects the backend and
   defaults to `local` (`services/shared/src/storage/storage.factory.ts`);
   valid values are `local`, `minio`, `s3` and `azure`:
```bash
grep -E '^(STORAGE_TYPE|LOCAL_STORAGE_PATH|MINIO_)' .env
```

3. Check storage permissions. Local storage writes to `LOCAL_STORAGE_PATH`,
   which defaults to `./storage` relative to the service's working directory:
```bash
ls -la services/controls/storage/
```

---

## Getting Help

If you're still stuck:

1. **Read the logs** — `.demo/logs/<service>.log`, `.demo/logs/frontend.log`,
   `.demo/logs/build-*.log`, and `docker compose logs <service>` for
   infrastructure. Most failures name their own cause.
2. **Search existing issues** on GitHub
3. **Include details** when reporting:
   - Error messages (full stack trace)
   - Steps to reproduce
   - Environment (OS, `node --version` — 18+ is required, 20+ recommended —
     and `docker --version`)
   - Relevant configuration (sanitized), and which template `.env` came from
