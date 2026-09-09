# GigaChad GRC - Quick Start Guide

Get the whole platform running locally with one command.

---

## 🚀 Just Want to Try It?

One command brings everything up and loads a fully populated demo organization:

```bash
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc
./scripts/start-demo.sh
```

Then open **http://localhost:3000** and click **"Dev Login (Skip SSO)"**.

A first run installs dependencies and builds everything, so it takes a few
minutes. Once `node_modules/` is present the whole start-up finishes in well
under a minute.

➡️ See the [Demo & Sandbox Guide](./DEMO.md) for more on the demo dataset.

---

## Prerequisites

- **Docker** (Desktop v24+, Colima, or Engine) with the Compose v2 plugin - [Download](https://www.docker.com/products/docker-desktop)
- **Node.js** 18 or newer (20+ recommended) - [Download](https://nodejs.org/)
- **Git** - [Download](https://git-scm.com/)

`start-demo.sh` checks Docker (installed and running, with Compose v2), Node.js
18+ and npm, and stops with a clear message if one is missing or if any required
port is already taken. Git is only needed for the clone.

## 1. Clone the Repository

```bash
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc
```

## 2. Start the Demo

```bash
./scripts/start-demo.sh
# or, equivalently:
npm run demo
```

| Flag | Effect |
|------|--------|
| `--skip-build` | Reuse existing `dist/` output instead of recompiling |
| `--no-seed` | Start with an empty database (no demo data) |
| `--no-browser` | Do not open a browser window |
| `--help` | Print the script's own usage notes |

The script performs these steps in order:

1. Checks prerequisites and that every required host port is free
2. Creates `.env` from `env.development` if it does not exist
3. Starts infrastructure in Docker: `postgres`, `keycloak`, `minio`
4. Creates the schema with `prisma db push`, then applies
   `database/dev-bootstrap.sql` (the development organization and user)
5. Runs `npm install` if `node_modules/` is missing, then builds
   `services/shared` and the six services
6. Starts the six services on the host and waits for each port
7. Loads demo data on first run
8. Starts the Vite dev server and opens your browser

Infrastructure runs in containers; the six services and the frontend run on the
host. That is the topology `env.development` is written for, and it avoids the
very long first-time image build. Press `Ctrl+C` to stop the host processes.

> **Do not run `prisma migrate deploy`.** The repository ships no baseline
> migration for `services/shared/prisma/schema.prisma` (129 models), so the
> schema is created with `prisma db push` — which is what the script does.

> **`database/init/*.sql` is legacy and no longer applied.** Those files are
> incremental patches written against tables Prisma now owns, and they are
> deliberately not mounted into the Postgres container. Do not pipe them in by
> hand; they fail against a Prisma-managed schema.

> **`database/dev-bootstrap.sql` is not optional.** It inserts the single
> organization and user that `DevAuthGuard` hard-codes. Without those rows the
> demo seeder fails with a Prisma `P2025` (record not found) error.

## What You Get

On first run the script loads the demo dataset via
`POST http://localhost:3001/api/seed/load-demo` — **roughly 1,000 records** in total (exact totals vary slightly per run):

| Data | Count |
|------|-------|
| Frameworks (SOC 2 Type II, ISO 27001:2022, HIPAA) | 3 |
| Framework requirements | 276 |
| Controls (with 1 implementation each) | 49 |
| Evidence | 20 |
| Policies | 15 |
| Vendors | 20 |
| Risks | 25 |
| Employees | 50 |
| Assets | 37 |
| Integrations | 10 |
| Audits | 5 |
| Control mappings, evidence links, vendor assessments, training records, background checks | randomised per run |

If the automatic load is skipped or fails, load it from the UI at
**Settings → Organization → Demo Data**. Re-running it returns HTTP 409 once the
organization holds data — reset from that same screen first. All endpoints are
throttled at 5 req/s, 30 req/10s and 100 req/min.

## Signing In

Open **http://localhost:3000** and click **"Dev Login (Skip SSO)"**. No password
is required — you land as an admin of the demo organization.

> Use `localhost`, **not** `127.0.0.1`. The Keycloak client in
> `auth/realm-export.json` only allows `http://localhost:3000/*` as a redirect
> URI, so `http://127.0.0.1:3000` produces an "invalid redirect uri" page.

Keycloak itself must be running even though Dev Login bypasses SSO:
`frontend/src/contexts/AuthContext.tsx` calls
`keycloak.init({ onLoad: 'check-sso' })` on every page load, and with Keycloak
down the browser fails with `ERR_CONNECTION_REFUSED` before the login screen
renders.

The Dev Login button is gated on Vite's built-in `import.meta.env.DEV`, so it
appears automatically in the dev server. You do **not** need to set
`VITE_ENABLE_DEV_AUTH`; that variable exists only to make production builds fail
loudly if dev auth is left switched on.

> ⚠️ **Development auth is not authentication.** In development every
> controller uses `DevAuthGuard`, which fabricates a full-permission admin from
> any request and never validates a token. The real JWKS-validating
> `JwtAuthGuard` in `services/shared/src/auth/jwt.guard.ts` is currently wired
> to zero controllers. Keep this stack bound to loopback and never expose it to
> a network.

## Where Everything Runs

| Surface | URL | Notes |
|---------|-----|-------|
| **Frontend (Vite)** | http://localhost:3000 | Proxies `/api/*` to the services below |
| **Controls API** | http://localhost:3001 | Also serves evidence, risks, assets, dashboards, users, tasks |
| **Frameworks API** | http://localhost:3002 | Frameworks, assessments, mappings |
| **Policies API** | http://localhost:3004 | Policies |
| **TPRM API** | http://localhost:3005 | Vendors, contracts, vendor assessments |
| **Trust API** | http://localhost:3006 | Questionnaires, knowledge base, trust center |
| **Audit API** | http://localhost:3007 | Audits, findings, workpapers, reports |
| **Keycloak Admin** | http://localhost:8080 | Realm `gigachad-grc`; credentials from `.env` (`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`, `admin` / `admin` in `env.development`) |
| **MinIO Console** | http://localhost:9001 | `minioadmin` / the `MINIO_ROOT_PASSWORD` value in your `.env` (`start-demo.sh` prints it on startup) |
| **PostgreSQL** | localhost:5433 | Container listens on 5432 |

There is no service on port **3003** — in `docker-compose.yml` that port belongs
to Grafana, which the demo does not start. Traefik (80/443/8090), Prometheus
(9090) and Grafana (3003) are all part of the container stack but out of scope
for the demo.

### Health check

Only the controls service exposes a health route:

```bash
curl http://localhost:3001/api/system/health
# {"status":"healthy",...}
```

The other five services expose none — the shared `HealthModule` is not wired
into them, so `/health` returns 404. Use a TCP port check for readiness, which
is what `start-demo.sh` does.

## Connection Reference

`start-demo.sh` copies `env.development` to `.env`; read the real values from
there rather than retyping them.

| Variable | Value in `env.development` | Description |
|----------|----------------------------|-------------|
| `DATABASE_URL` | `postgresql://grc:<POSTGRES_PASSWORD>@localhost:5433/gigachad_grc` | PostgreSQL connection (user `grc`, database `gigachad_grc`, host port 5433) |
| `KEYCLOAK_REALM` | `gigachad-grc` | Realm imported from `auth/realm-export.json` |
| `KEYCLOAK_CLIENT_ID` | `grc-services` | Backend client (the frontend uses `grc-frontend`) |
| `NODE_ENV` | `development` | Must stay `development`; `DevAuthGuard` throws on `production`, which turns every controls endpoint into an HTTP 500 |
| `VITE_API_URL` | *(empty)* | Leave empty so the Vite proxy routes each `/api/*` prefix to the right service |

There is no `env.example` at the repository root. The templates are
`env.development` for local work and `deploy/env.example` /
`env.example.production` for production — do not seed a development `.env` from
the production templates.

Open a psql shell against the running database with:

```bash
docker compose exec postgres psql -U grc -d gigachad_grc
```

## Stopping

```bash
./scripts/stop-demo.sh          # stop host processes and containers, keep data
# or: npm run demo:stop
```

| Flag | Effect |
|------|--------|
| `--clean` | Also drop the PostgreSQL and MinIO volumes, so the next run starts from an empty database and re-seeds |
| `--purge` | Everything `--clean` does, plus remove `.env`, `.demo/` and built output |

To wipe and start over in one step:

```bash
npm run demo:reset   # stop-demo.sh --clean && start-demo.sh
```

## Running One Service by Hand

Useful when you want to attach a debugger or watch one service's output
directly. Build first, load the root `.env` into your shell (services read
their configuration from the environment, and their working directory has no
`.env` of its own), then start the service on its assigned port:

```bash
npm run build:services            # builds services/shared + all six services

set -a && . ./.env && set +a      # export DATABASE_URL, secrets...

cd services/controls && PORT=3001 node dist/main
```

| Service directory | `PORT` |
|-------------------|--------|
| `services/controls` | 3001 |
| `services/frameworks` | 3002 |
| `services/policies` | 3004 |
| `services/tprm` | 3005 |
| `services/trust` | 3006 |
| `services/audit` | 3007 |

The frontend runs the same way:

```bash
cd frontend && npm run dev -- --port 3000 --strictPort
```

Keep the port fixed at 3000: if Vite moves to another port, Keycloak's redirect
URI allow-list no longer matches and sign-in breaks.

Other handy root scripts:

```bash
npm run build:shared   # rebuild services/shared only (built before any service)
npm run db:push        # re-sync the schema after editing schema.prisma
npm run db:studio      # browse the database in Prisma Studio
```

## Troubleshooting

See the [Troubleshooting Guide](./TROUBLESHOOTING.md) for port conflicts, database
connection failures, the `NODE_ENV=production` HTTP 500, and logs (`.demo/logs/`).

Not covered there: `docker-compose.dev.yml` is stale — it references
`services/integrations`, `services/mcp` and `frontend/Dockerfile.dev`, none of
which exist in the repository. It is not a supported workflow.

## Next Steps

1. **Explore the UI** - Navigate through Controls, Risks, Evidence
2. **Review the frameworks** - The demo ships SOC 2 Type II, ISO 27001:2022 and HIPAA
3. **Read the docs** - See the `docs/` folder for detailed guides

## Getting Help

- 📖 [Documentation index](../README.md)
- 🏗️ [Architecture](./ARCHITECTURE.md)
- 🐛 [Troubleshooting Guide](./TROUBLESHOOTING.md)
- 🚀 [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
