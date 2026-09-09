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

Then open **http://localhost:3000** and click **"Dev Login (Skip SSO)"** — the
demo bypass, which needs no Firebase project and no password.

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
3. Starts infrastructure in Docker: `postgres`, `minio`
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
> organization (`8924f0c1-7bb1-4be8-84ee-ad8725c712bf`) and user
> (`8f88a42b-e799-455c-b68a-308d7d2e9aa4`, `john.doe@example.com`,
> `external_id` = `demo-user`) that `AUTH_MODE=demo` resolves against. Without
> those rows every request is refused and the demo seeder fails with a Prisma
> `P2025` (record not found) error.

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

Sign-in is **Firebase Authentication with Google as the only provider**. The
ID token proves identity; the role, permissions and organization always come
from the `users` row in PostgreSQL.

The local demo does not need a Firebase project. `scripts/start-demo.sh` starts
the six services with **`AUTH_MODE=demo`**, which is the one and only auth
bypass: `FirebaseAuthGuard`
(`services/shared/src/auth/firebase-auth.guard.ts`) skips token verification
and loads the seeded demo identity (`external_id` = `demo-user`) through the
same database code path a real Google sign-in uses.

Open **http://localhost:3000** and click **"Dev Login (Skip SSO)"**. No
password is required — you land as an admin of the demo organization.

> The button is rendered only when the Vite dev server sees
> **`VITE_AUTH_MODE=demo`** — `frontend/src/contexts/AuthContext.tsx` gates it
> on `import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'demo'`.
> `env.development` sets it (line 107) and `start-demo.sh` copies that file to
> `.env` on first run, so the button is there out of the box. It cannot leak
> into a deployment: Vite compiles `import.meta.env.DEV` to `false` in a
> production build, which makes the whole branch dead code no matter what the
> variable says.

> Use `localhost`, **not** `127.0.0.1`. `CORS_ORIGINS` in `env.development`
> lists `http://localhost:3000`, and a Firebase project's Authorized domains
> list works the same way, so the loopback IP is not an accepted origin.

> ⚠️ **`AUTH_MODE=demo` is not authentication.** Every request is served as the
> demo admin. The guard hard-throws when `NODE_ENV=production`, so it cannot
> reach a real deployment, but keep this stack bound to loopback and never
> expose it to a network.

To exercise a real Google sign-in locally, unset `AUTH_MODE`, set
`FIREBASE_PROJECT_ID`, `ALLOWED_EMAIL_DOMAINS` and the three
`VITE_FIREBASE_*` values in `.env`, and add a `users` row for your Google
address. The full procedure is in the
[Deployment Runbook](./DEPLOYMENT-RUNBOOK.md).

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
| **MinIO Console** | http://localhost:9001 | `minioadmin` / the `MINIO_ROOT_PASSWORD` value in your `.env` (`start-demo.sh` prints it on startup) |
| **PostgreSQL** | localhost:5433 | Container listens on 5432 |

There is no service on port **3003** — in `docker-compose.yml` that port belongs
to Grafana, which the demo does not start. Traefik (80/443/8090), Prometheus
(9090) and Grafana (3003) are all part of the container stack but out of scope
for the demo.

### Health check

All six services wire the shared `HealthModule`, so each one answers on its own
port:

```bash
curl http://localhost:3001/health         # full check (database + memory)
curl http://localhost:3001/health/live    # liveness
curl http://localhost:3001/health/ready   # readiness
```

The controls service additionally exposes a richer, unauthenticated
`GET /api/system/health`:

```bash
curl http://localhost:3001/api/system/health
# {"status":"healthy",...}
```

## Connection Reference

`start-demo.sh` copies `env.development` to `.env`; read the real values from
there rather than retyping them.

| Variable | Value in `env.development` | Description |
|----------|----------------------------|-------------|
| `DATABASE_URL` | `postgresql://grc:<POSTGRES_PASSWORD>@localhost:5433/gigachad_grc` | PostgreSQL connection (user `grc`, database `gigachad_grc`, host port 5433) |
| `AUTH_MODE` | `demo` | The one auth bypass: `FirebaseAuthGuard` serves every request as the seeded demo admin. The guard throws if `NODE_ENV=production` |
| `VITE_AUTH_MODE` | `demo` | Renders the **Dev Login (Skip SSO)** button in the dev server |
| `FIREBASE_PROJECT_ID` | *(empty)* | Required only when you turn `AUTH_MODE` off and use real Google sign-in |
| `NODE_ENV` | `development` | Must stay `development`; `FirebaseAuthGuard` refuses to boot with `AUTH_MODE=demo` and `NODE_ENV=production` |
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

Keep the port fixed at 3000: `CORS_ORIGINS` in `env.development` lists
`http://localhost:3000`, and it is the origin a Firebase project's Authorized
domains list would be configured for, so a different port breaks API calls and
real Google sign-in.

Other handy root scripts:

```bash
npm run build:shared   # rebuild services/shared only (built before any service)
npm run db:push        # re-sync the schema after editing schema.prisma
npm run db:studio      # browse the database in Prisma Studio
```

## Troubleshooting

See the [Troubleshooting Guide](./TROUBLESHOOTING.md) for port conflicts,
database connection failures, services that refuse to boot because `.env` sets
`NODE_ENV=production`, and logs (`.demo/logs/`).

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
- 🚀 [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md) — start-to-finish production deployment
