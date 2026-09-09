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

Infrastructure (PostgreSQL, Keycloak, MinIO) runs in Docker, so those
logs come from Compose:

```bash
docker compose ps
docker compose logs postgres
docker compose logs -f keycloak
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
| 8080 | Keycloak |
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

> **The development stack has no authentication.** Every controller is wired to
> `DevAuthGuard`, which fabricates a full-permission admin from any request; the
> real JWKS-validating `JwtAuthGuard` in
> `services/shared/src/auth/jwt.guard.ts` is bound to zero controllers. Bind
> the demo to loopback only and never expose it to a network.

### "Invalid redirect URI" from Keycloak

**Symptom:** Keycloak answers with an "Invalid redirect uri" page instead of
the login screen.

**Solution:**

Open the app at `http://localhost:3000`. The Keycloak client shipped in
`auth/realm-export.json` (realm `gigachad-grc`, client `grc-frontend`) allows
only these values:

| Setting | Allowed values |
|---------|----------------|
| Valid redirect URIs | `http://localhost:3000/*`, `http://localhost/*` |
| Web origins | `http://localhost:3000`, `http://localhost`, `+` |

`http://127.0.0.1:3000` is **not** on that list, so loading the app on
127.0.0.1 produces this error even though the frontend is serving correctly.

To allow another hostname (or for production), add it in the Keycloak Admin
Console at `http://localhost:8080` → realm `gigachad-grc` → Clients →
`grc-frontend`, under *Valid redirect URIs* and *Web origins*. The admin
credentials come from `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` in `.env`.

### "Token validation failed"

**Symptom:** API requests fail with 401 after successful login.

**Solution:**

In development this cannot be a token problem: `DevAuthGuard` never validates
one. A 401 in the demo means the request never reached a service — see *One
page works but another tab errors* — and a 500 usually means
`NODE_ENV=production` in `.env`. The steps below apply to a deployment that
uses real Keycloak tokens.

1. Check the token is being stored (`grc_token`, see
   `frontend/src/lib/secureStorage.ts`):
```javascript
// In browser console
console.log(sessionStorage.getItem('grc_token'));
```

2. Verify the token is being sent:
```javascript
// Check network tab in browser DevTools
// Look for Authorization header in requests
```

3. Ensure backend and frontend agree on the realm — `gigachad-grc` in
   `env.development`, with clients `grc-frontend` (SPA) and `grc-services`
   (backend):
```bash
grep -E '^(VITE_)?KEYCLOAK_(URL|REALM|CLIENT_ID)' .env
```

### Dev login not working

**Symptom:** Development authentication bypass doesn't work.

**Solution:**

The Dev Login button is gated on Vite's `import.meta.env.DEV`, so it is present
in any dev-server build. `VITE_ENABLE_DEV_AUTH` does **not** enable it — that
variable exists only so a production build fails loudly if dev auth is left
switched on, and setting it fixes nothing. There are three real causes:

1. **`.env` sets `NODE_ENV=production`.** `DevAuthGuard`
   (`services/*/src/auth/dev-auth.guard.ts`) throws in production, so every
   controls endpoint answers HTTP **500** rather than 401 and the UI shows
   errors everywhere, not just at login:
```bash
grep '^NODE_ENV' .env      # must be development
mv .env .env.production.bak && cp env.development .env
```
   `./scripts/start-demo.sh` refuses to start against such a `.env`. Older
   versions of the script seeded `.env` from `deploy/env.example`, which sets
   `NODE_ENV=production`; use `env.development` for local work.

2. **The page was opened on `127.0.0.1:3000`.** Keycloak only allows
   `http://localhost:3000/*` as a redirect URI, so the login screen is replaced
   by an "Invalid redirect uri" page. Use `http://localhost:3000`.

3. **Keycloak is not running.** `frontend/src/contexts/AuthContext.tsx` calls
   `keycloak.init({ onLoad: 'check-sso' })` on every page load, so a missing
   Keycloak fails with `ERR_CONNECTION_REFUSED` before the login screen renders
   — even though the demo itself signs in with Dev Login and never validates a
   token. Keycloak is therefore required:
```bash
docker compose ps keycloak
curl -sf http://localhost:8080/realms/gigachad-grc >/dev/null && echo ok
```

If the button appears but clicking it leaves you on the login page, clear stale
auth state:

```javascript
// In the browser console
localStorage.clear();
sessionStorage.clear();
location.reload();
```

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

**Cause:** Keycloak used to share the application database, putting ~90 of its
tables into the same `public` schema Prisma owns. Keycloak now uses a dedicated
`keycloak` database (`database/bootstrap/00-create-keycloak-db.sql`), but a
postgres volume created before that change still holds the old tables, and
`db push` offers to drop them rather than continue.

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
`DevAuthGuard`, which injects one fixed organization and user. The seeder
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
which silently breaks the Keycloak redirect URI. The demo now passes
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

4. Always open `http://localhost:3000` — `127.0.0.1:3000` is rejected by
   Keycloak's redirect-URI check.

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

Only the controls service exposes a health route
(`GET http://localhost:3001/api/system/health`, which returns
`{"status":"healthy",...}`). The other five do not wire the shared health
module, so `/health` and `/api/health` return 404 on them — readiness for those
is a TCP port check, as above.

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
