# GigaChad GRC - Demo & Sandbox Guide

This comprehensive guide explains how to run GigaChad GRC in demo mode to explore the platform with realistic sample data—all completely free.

---

## Table of Contents

- [Quick Start Options](#quick-start-options)
- [Prerequisites](#prerequisites)
- [Option 1: One-Click Local Demo](#option-1-one-click-local-demo-recommended)
- [Option 2: GitHub Codespaces](#option-2-github-codespaces)
- [Option 3: Manual Setup](#option-3-manual-setup)
- [Loading Demo Data](#loading-demo-data)
- [What's Included in Demo Data](#whats-included-in-demo-data)
- [Demo Auth Mode](#demo-auth-mode)
- [Exploring the Platform](#exploring-the-platform)
- [Resetting Demo Data](#resetting-demo-data)
- [Troubleshooting](#troubleshooting)

---

## Quick Start Options

| Method | Time to Start | Requirements | Best For |
|--------|---------------|--------------|----------|
| **One-Click Script** | ~3 minutes | Docker Desktop, Node.js | Local evaluation |
| **GitHub Codespaces** | ~2 minutes | GitHub account | Developers with Codespaces access |
| **Manual Setup** | ~10 minutes | Docker, Node.js | Custom configuration |

---

## Prerequisites

### For Local Demo (Options 1 & 3)

| Requirement | Version | Download |
|-------------|---------|----------|
| **Docker** with Compose v2 | v24.0+ | Docker Desktop, Colima or Engine — `start-demo.sh` only checks that `docker info` and `docker compose version` work: [docker.com](https://www.docker.com/products/docker-desktop) |
| **Node.js** | v18+ (v20 recommended) | [nodejs.org](https://nodejs.org/) |
| **Git** | Any recent version | [git-scm.com](https://git-scm.com/) |

#### Verify Installation

```bash
# Check Docker
docker --version
# Expected: Docker version 24.x.x or higher

# Check Docker Compose
docker compose version
# Expected: Docker Compose version v2.x.x

# Check Node.js
node --version
# Expected: v18.x.x or v20.x.x

# Check Git
git --version
```

#### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4 GB | 8 GB |
| Disk Space | 5 GB | 10 GB |
| CPU | 2 cores | 4 cores |

### For Browser-Based Demo (Option 2)

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- GitHub account (for Codespaces)

---

## Option 1: One-Click Local Demo (Recommended)

The fastest way to see GigaChad GRC in action on your local machine.

### Step 1: Clone the Repository

```bash
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc
```

### Step 2: Run the Demo Script

```bash
./scripts/start-demo.sh
```

### What the Script Does

1. ✅ Verifies Docker is running and that every required host port is free
2. ✅ Creates `.env` from `env.development` if missing (and refuses a `.env`
   carrying `NODE_ENV=production`)
3. ✅ Starts infrastructure (PostgreSQL and MinIO — that is all the demo needs)
4. ✅ Waits for the database, then creates the schema with `prisma db push`
5. ✅ Applies `database/dev-bootstrap.sql` (the organization and user the
   `AUTH_MODE=demo` identity resolves to)
6. ✅ Builds the shared library and the six services, then starts them with
   `AUTH_MODE=demo`
7. ✅ Installs frontend dependencies (if needed) and starts the Vite dev server
   with `VITE_AUTH_MODE=demo`
8. ✅ Loads demo data on the first run
9. ✅ Opens your browser to `http://localhost:3000`

Use `http://localhost:3000`, not `127.0.0.1:3000`. Firebase authorised domains
and the Google OAuth redirect are registered for `http://localhost:3000`, which
is why the script always opens that origin and passes `--strictPort` so Vite
cannot move off it.

### Expected Output

```
╔═══════════════════════════════════════════════════════════════╗
║   🚀 GigaChad GRC - One-Click Demo                            ║
╚═══════════════════════════════════════════════════════════════╝

[1/8] Checking prerequisites...
   ✓ Docker is running
   ✓ Node.js v20.11.1
   ✓ All required ports are free

[2/8] Setting up environment...
   ✓ Created .env from env.development

[3/8] Starting infrastructure (PostgreSQL, MinIO)...
   ✓ PostgreSQL ready

... (schema, build, services, demo data, frontend)

╔═══════════════════════════════════════════════════════════════╗
║   🎉 GigaChad GRC is ready!                                   ║
╚═══════════════════════════════════════════════════════════════╝

📍 Open the app:
   http://localhost:3000

🔐 Sign in:
   Click 'Dev Login (Skip SSO)'. No password needed.
   You are signed in as John Doe (admin) of the demo organization.

🔧 Other endpoints:
   Controls API health   http://localhost:3001/api/system/health
   MinIO console         http://localhost:9001  (minioadmin / ...)

📄 Logs: .demo/logs/
```

There is no identity-provider container and no admin console to visit: the
demo signs in through the `AUTH_MODE=demo` bypass, not through an IdP.

### Stopping the Demo

```bash
# Stop the frontend, the six services and the containers
./scripts/stop-demo.sh

# Also drop the PostgreSQL and MinIO volumes (fresh start next time)
./scripts/stop-demo.sh --clean

# Also delete .env and built output
./scripts/stop-demo.sh --purge
```

Ctrl+C in the terminal running the script stops the frontend and the six host
processes but leaves the containers running; `stop-demo.sh` stops those too.

---

## Option 2: GitHub Codespaces

Use GitHub's built-in cloud development environment.

### Step 1: Open Codespaces

1. Navigate to the repository on GitHub
2. Click the green **"Code"** button
3. Select the **"Codespaces"** tab
4. Click **"Create codespace on main"**

### Step 2: Wait for the Container

The repository ships no `.devcontainer` configuration, so a codespace is a plain
Linux container with Docker and Node.js available. Nothing is started for you.

### Step 3: Start the Application

Once the terminal is ready:

```bash
./scripts/start-demo.sh
```

The script creates `.env` from `env.development`, creates the schema, inserts the
development organization and user, starts the services and loads demo data.

### Step 4: Access the Application

- Click "Open in Browser" when the port notification appears
- Or go to the "Ports" tab and click the globe icon for port 3000

### Codespaces Free Tier

- **60 hours/month** free for personal accounts
- **90 hours/month** for Pro accounts
- Included with GitHub Teams/Enterprise

---

## Option 3: Manual Setup

For users who want more control over the setup process.

### Step 1: Clone and Install

```bash
# Clone repository
git clone https://github.com/rajkrishnamurthy/gigachad-grc.git
cd gigachad-grc

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Step 2: Start Infrastructure

```bash
# Start the database and object storage — the only containers the demo needs
docker compose up -d postgres minio

# Wait for services to be healthy
docker compose ps
```

There is no identity-provider container. Authentication in the demo is the
`AUTH_MODE=demo` bypass in `services/shared/src/auth/firebase-auth.guard.ts`;
a real deployment points `FIREBASE_PROJECT_ID` at a Firebase project instead.

### Step 3: Configure Environment

```bash
cp env.development .env
```

> ⚠️ Use `env.development`. There is no `env.example` at the repository root, and
> `deploy/env.example` is the **production** template — it sets
> `NODE_ENV=production`, which makes `FirebaseAuthGuard` refuse to start under
> `AUTH_MODE=demo` ("SECURITY ERROR: AUTH_MODE=demo is set but NODE_ENV is
> production").

`env.development` already ships `AUTH_MODE=demo` and `VITE_AUTH_MODE=demo`, with
`FIREBASE_PROJECT_ID`, `ALLOWED_EMAIL_DOMAINS` and the `VITE_FIREBASE_*` values
left empty. Nothing else has to be configured for the demo.

Leave `VITE_API_URL` empty, as the template ships it: the Vite dev server proxies
each `/api/*` prefix to the service that owns it (`frontend/vite.config.ts`).
Pointing the SPA at a single service breaks every other module.

### Step 4: Create the Database Schema

```bash
# One shared schema for all six services
npm run db:push

# Insert the organization and user the demo identity resolves to
docker compose exec -T postgres \
  psql -U grc -d gigachad_grc < database/dev-bootstrap.sql
```

Without those two rows the demo seeder fails with Prisma error `P2025`.

### Step 5: Start Services

**Option A: Docker (all services)**
```bash
docker compose up -d
```

`docker-compose.yml` passes `AUTH_MODE: ${AUTH_MODE:-demo}` to every service, so
a `.env` copied from `env.development` keeps the demo bypass in place. The first
build takes 25–60 minutes, which is why `start-demo.sh` runs the services on the
host instead.

**Option B: On the host (separate terminals)**

Each service reads its configuration from the process environment, and it is
started from its own directory — so export the root `.env` first, otherwise
`FirebaseAuthGuard` aborts at boot with "FIREBASE_PROJECT_ID is not set".

Terminal 1 — Controls API (port 3001):
```bash
set -a; . ./.env; set +a
cd services/controls && PORT=3001 npm run start:dev
```

Terminal 2 — Frameworks API (port 3002):
```bash
set -a; . ./.env; set +a
cd services/frameworks && PORT=3002 npm run start:dev
```

Terminal 3 — Frontend:
```bash
cd frontend && VITE_AUTH_MODE=demo npm run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

Vite loads `.env` from `frontend/`, not from the repository root, and no such
file is committed — so pass `VITE_AUTH_MODE=demo` on the command line (Vite
exposes `VITE_`-prefixed variables already in the environment). Without it the
"Dev Login (Skip SSO)" button never renders.

The remaining services are `policies` (3004), `tprm` (3005), `trust` (3006) and
`audit` (3007); start the ones whose modules you want to use. Pages backed by a
service that is not running show a request error.

### Step 6: Access the Application

Open `http://localhost:3000` in your browser.

---

## Loading Demo Data

Once the platform is running, load comprehensive sample data to explore all features.

### Method 1: Via the User Interface (Recommended)

1. **Log in** to the platform
   - Click the **"Dev Login (Skip SSO)"** button on the login page
   - This logs you in as an admin user

2. **Navigate to Demo Data Settings**
   - Click your profile icon (top-right)
   - Go to **Settings** → **Organization**
   - Scroll to the **"Demo Data"** section

3. **Load Demo Data**
   - Review what will be created
   - Click **"Load Demo Data"**
   - Wait for confirmation (~10-30 seconds)

### Method 2: Via API

```bash
curl -X POST http://localhost:3001/api/seed/load-demo
```

Under `AUTH_MODE=demo` requests need no token: `FirebaseAuthGuard` skips
verification and resolves the demo identity from PostgreSQL. Re-running the
route returns HTTP **409** once the organization holds data; reset it first (see
[Resetting Demo Data](#resetting-demo-data)).

### Method 3: Automatically, via the Demo Script

`./scripts/start-demo.sh` loads demo data on its first run, so with Option 1
there is nothing to do. Pass `--no-seed` to start without it.

(The old `scripts/seed-database.ts` is non-functional — it reads a
`database/seeds/` directory that does not exist. Use the route above.)

### Verification

After loading, you should see:
- ✅ Controls populated in the Controls page
- ✅ Policies in the Policies module
- ✅ Vendors in Third-Party Risk
- ✅ Risks in the Risk Register
- ✅ Employees in HR Compliance

---

## What's Included in Demo Data

The demo dataset includes realistic sample data across all platform modules:

### Data Summary

| Module | Records | Description |
|--------|---------|-------------|
| **Controls** | 50+ | Security controls across 10 categories |
| **Frameworks** | 3 | SOC 2 Type II, ISO 27001:2022, HIPAA |
| **Policies** | 15+ | Security, privacy, HR, and operational policies |
| **Risks** | 25 | Technical, operational, and compliance risks |
| **Vendors** | 20 | SaaS providers, cloud services, consultants |
| **Employees** | 50 | With training records and compliance status |
| **Assets** | 30+ | Hardware, software, and cloud resources |
| **Audits** | 5 | Internal and external audit records |
| **Evidence** | 100+ | Documents, screenshots, and certificates |

### Control Categories

| Category | Controls | Examples |
|----------|----------|----------|
| **Access Control** | 7 | MFA, PAM, Access Reviews, Password Policy |
| **Data Protection** | 6 | Encryption at Rest/Transit, Backup, Key Management |
| **Security Operations** | 7 | Vulnerability Management, Incident Response, SIEM |
| **Network Security** | 5 | Firewall, IDS/IPS, Segmentation, DDoS Protection |
| **Physical Security** | 3 | Facility Access, Visitor Management, Environmental |
| **Human Resources** | 5 | Background Checks, Training, Offboarding |
| **Vendor Management** | 3 | Risk Assessment, Contracts, Monitoring |
| **Change Management** | 4 | Code Review, Testing, Rollback Procedures |
| **Business Continuity** | 3 | BCP, Disaster Recovery, Recovery Testing |
| **Risk Management** | 3 | Assessment, Treatment, Monitoring |
| **Compliance** | 3 | Monitoring, Audit Support, Policy Management |

### Sample Vendors

| Vendor | Category | Risk Rating |
|--------|----------|-------------|
| AWS | Cloud Infrastructure | Low |
| Salesforce | CRM | Medium |
| Slack | Communication | Low |
| ADP | HR/Payroll | Medium |
| Cloudflare | Security | Low |
| DocuSign | Document Management | Low |

### Sample Risks

| Risk | Category | Impact | Likelihood |
|------|----------|--------|------------|
| Data Breach | Security | High | Medium |
| Vendor Dependency | Operational | Medium | High |
| Compliance Violation | Regulatory | High | Low |
| System Downtime | Availability | Medium | Medium |

---

## Demo Auth Mode

`AUTH_MODE=demo` gives instant access without a Firebase project.

### How It Works

1. **Backend.** `FirebaseAuthGuard` — the only authentication guard in the
   system, referenced by 99 `@UseGuards` sites — sees `AUTH_MODE=demo` and skips
   Google ID token verification. It still resolves the identity out of
   PostgreSQL through the same code path a real sign-in uses, so demo and
   production cannot drift apart in how a `UserContext` is built. The row it
   loads is the one `database/dev-bootstrap.sql` inserts
   (`external_id = 'demo-user'`).
2. **Frontend.** The **"Dev Login (Skip SSO)"** button renders only when
   `import.meta.env.DEV && VITE_AUTH_MODE === 'demo'`
   (`frontend/src/contexts/AuthContext.tsx`), so a production bundle cannot
   contain a reachable bypass. Clicking it marks the context authenticated with
   **no** token and mirrors the same identity the API will report; the session
   is kept in `sessionStorage` so a page refresh does not sign you out.
3. The other button, **"Sign in with Google"**, is the real path and needs
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` and
   `VITE_FIREBASE_PROJECT_ID` at build time plus `FIREBASE_PROJECT_ID` on the
   API. It does nothing in a demo checkout, where those are empty.

Both variables are already set in `env.development`; `start-demo.sh` also
passes them explicitly so a `.env` predating them still works.

> There is no `USE_DEV_AUTH` or `VITE_ENABLE_DEV_AUTH`. `AUTH_MODE` /
> `VITE_AUTH_MODE` are the only switches.

### Demo User Details

| Property | Value |
|----------|-------|
| User ID | `8f88a42b-e799-455c-b68a-308d7d2e9aa4` (John Doe) |
| Email | `john.doe@example.com` |
| Role | `admin` |
| Organization | `8924f0c1-7bb1-4be8-84ee-ad8725c712bf` (default org) |
| Permissions | Full access to all modules |

Those two UUIDs, plus `external_id = 'demo-user'` and the email above, are
constants in `services/shared/src/auth/firebase-auth.guard.ts` and are inserted
by `database/dev-bootstrap.sql`. `permissions` is empty in the demo context;
the frontend's `hasPermission()` returns true for every check while the demo
bypass is active, and the API's `PermissionGuard` reads the admin role from the
seeded row.

### Security Note

⚠️ **Never run the demo configuration in production.** With `AUTH_MODE=demo`
every request is served as `john.doe@example.com` with no token at all. Two
things stop it reaching production, and neither is a reason to relax:

- `FirebaseAuthGuard` throws at boot when `AUTH_MODE=demo` meets
  `NODE_ENV=production` ("SECURITY ERROR: AUTH_MODE=demo is set but NODE_ENV is
  production"), so the service refuses to start rather than serving open.
- `vite.config.ts` fails a production build outright if `VITE_AUTH_MODE=demo`
  is still set, and the button is additionally gated on `import.meta.env.DEV`.

Keep the demo on loopback anyway.

---

## Exploring the Platform

After loading demo data, here's a suggested tour:

### 1. Dashboard (Home)

- View compliance posture overview
- Check control implementation status
- See risk heat map

### 2. Controls Module

- Browse 50+ security controls
- View implementation status
- See framework mappings

### 3. Frameworks

- Explore SOC 2, ISO 27001, HIPAA
- View requirements hierarchy
- Check compliance gaps

### 4. Risk Management

- Browse the risk register
- View risk heat map
- Review treatment plans

### 5. Third-Party Risk (TPRM)

- View vendor inventory
- Check risk assessments
- Review vendor tiers

### 6. Policies

- Browse security policies
- View policy versions
- Check acknowledgment status

### 7. Evidence Library

- View uploaded evidence
- Check evidence-control mappings
- Preview documents

### 8. Employee Compliance

- View employee training status
- Check background check records
- Review compliance metrics

### 9. Audits

- View audit history
- Check findings and remediation
- Review audit schedules

### 10. Settings

- Organization configuration
- Demo data management
- User preferences

---

## Resetting Demo Data

Clear all data to start fresh or reload demo data.

### Via the UI

1. Navigate to **Settings** → **Organization** → **Demo Data**
2. Click **"Reset All Data"**
3. Review the data that will be deleted
4. Type `DELETE ALL DATA` exactly as shown
5. Wait for the 5-second countdown
6. Click **"Delete All Data"**

### Via API

```bash
curl -X POST http://localhost:3001/api/seed/reset \
  -H "Content-Type: application/json" \
  -d '{"confirmationPhrase": "DELETE ALL DATA"}'
```

### What Gets Deleted

| Deleted | Preserved |
|---------|-----------|
| Controls | User accounts |
| Evidence | Organization settings |
| Policies | System configuration |
| Risks | Audit logs |
| Vendors | |
| Employees | |
| Assets | |
| Audits | |
| All related records | |

### Reload Demo Data

After resetting, you can load demo data again:
- Via UI: **Settings** → **Organization** → **Load Demo Data**
- Via API: `POST /api/seed/load-demo`

---

## Troubleshooting

### Demo Script Issues

#### "Docker is not running"

**Solution:** Start Docker Desktop and try again.

```bash
# macOS
open -a Docker

# Then retry
./scripts/start-demo.sh
```

#### "Permission denied" when running script

**Solution:** Make the script executable.

```bash
chmod +x scripts/start-demo.sh
./scripts/start-demo.sh
```

#### Script hangs on "Waiting for database"

**Solution:** Check Docker container status.

```bash
docker compose ps
docker compose logs postgres
```

### Loading Demo Data Issues

#### "Organization already has data"

**Cause:** Data already exists in the organization.

**Solution:** Reset data first, then reload.

#### "Demo data is already loaded"

**Cause:** Demo data was previously loaded.

**Solution:** Reset to reload fresh demo data.

#### "Only administrators can load demo data"

**Cause:** Logged in as non-admin user.

**Solution:** Use "Dev Login (Skip SSO)", which signs you in as the seeded admin.

### Dev Login Issues

#### "Dev Login (Skip SSO)" button not showing

**Cause:** The button is gated on `import.meta.env.DEV && VITE_AUTH_MODE ===
'demo'` (`frontend/src/contexts/AuthContext.tsx`). Either the frontend is not
running under the Vite dev server — a production build never shows it — or
`VITE_AUTH_MODE` is not `demo` in the dev server's environment. Vite reads
`frontend/.env`, not the repository root `.env`.

**Solution:** Run the dev server the way the demo script does.

```bash
cd frontend
VITE_AUTH_MODE=demo npm run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

#### Services refuse to start, or every page shows errors

**Cause:** `.env` carries `NODE_ENV=production` — usually from copying
`deploy/env.example`. `FirebaseAuthGuard` throws while being constructed when
`AUTH_MODE=demo` meets `NODE_ENV=production`, so the service fails to boot
rather than serving unauthenticated traffic. `start-demo.sh` detects this in
step 2 and refuses to continue.

**Solution:** Use the development template and restart.

```bash
grep '^NODE_ENV=' .env          # must be development
mv .env .env.production.bak && cp env.development .env
./scripts/stop-demo.sh && ./scripts/start-demo.sh
```

#### "FIREBASE_PROJECT_ID is not set" at startup

**Cause:** `AUTH_MODE` is not `demo` and no Firebase project is configured, so
the guard has nothing to validate token issuers against and refuses to guess.

**Solution:** For a demo, make sure `AUTH_MODE=demo` reaches the service — it is
in `env.development`, and a manually started service needs the root `.env`
exported (`set -a; . ./.env; set +a`).

### Service Issues

#### "Connection refused" errors

**Cause:** Services not running, or the frontend proxying to a service that
stopped. In the demo the six services run on the host, not in containers, so
`docker compose` will not show them.

**Solution:**
```bash
# Check the containers
docker compose ps

# Check a service log (controls, frameworks, policies, tprm, trust, audit)
tail -20 .demo/logs/controls.log

# Restart everything
./scripts/stop-demo.sh && ./scripts/start-demo.sh --skip-build
```

#### Port already in use

**Cause:** Another process using the port.

**Solution:**
```bash
# Find the process
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Codespaces Issues

#### Environment won't start

**Solution:** 
1. Try stopping and restarting the codespace
2. Clear browser cache and try again
3. Check the GitHub Codespaces status page

#### Can't access the application

**Solution:**
1. Check the "Ports" tab for port 3000
2. Ensure port visibility is set to "Public"
3. Click the URL or globe icon to open

---

## Related Documentation

- [Quick Start Guide](./QUICK_START.md) - Full installation guide
- [Development Setup](./DEVELOPMENT.md) - Development environment configuration
- [Configuration Guide](./CONFIGURATION.md) - Environment variables and settings
- [Architecture Guide](./ARCHITECTURE.md) - System architecture overview
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues and solutions
- [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md) - Putting this into production

---

## Getting Help

- 📖 **Documentation**: Check the `/docs` folder
- 💬 **Discussions**: GitHub Discussions for questions
- 🐛 **Issues**: GitHub Issues for bugs
- 🔒 **Security**: See [SECURITY.md](../SECURITY.md) for vulnerability reporting

---

*Last updated: December 2024*
