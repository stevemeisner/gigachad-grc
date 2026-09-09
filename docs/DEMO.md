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
- [Using Dev Auth Mode](#dev-auth-mode)
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
| **Docker Desktop** | v24.0+ | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) |
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
3. ✅ Starts infrastructure (PostgreSQL, Redis, Keycloak, MinIO)
4. ✅ Waits for the database, then creates the schema with `prisma db push`
5. ✅ Applies `database/dev-bootstrap.sql` (the organization and user
   `DevAuthGuard` hard-codes)
6. ✅ Builds the shared library and the six services, then starts them
7. ✅ Installs frontend dependencies (if needed) and starts the dev server
8. ✅ Loads demo data on the first run
9. ✅ Opens your browser to `http://localhost:3000`

Use `http://localhost:3000`, not `127.0.0.1:3000` — only `localhost` is in
Keycloak's redirect allow-list (`auth/realm-export.json`).

### Expected Output

```
🚀 GigaChad GRC Demo Launcher
==============================

📦 Starting infrastructure services...
⏳ Waiting for database to be ready...
✓ Database is ready
🏗️ Starting application services...
⏳ Waiting for services to start...
✓ API services are ready
🎨 Starting frontend...
⏳ Waiting for frontend...
✓ Frontend is ready

================================================
🎉 GigaChad GRC Demo is Ready!
================================================

📍 Access Points:
   Frontend:      http://localhost:3000
   API Docs:      http://localhost:3001/api/docs
   Keycloak:      http://localhost:8080 (admin/admin)

🔐 Login:
   Click 'Dev Login' button for instant access

📊 Demo Data:
   Go to Settings > Organization > Load Demo Data
```

### Stopping the Demo

```bash
# Stop the frontend, the six services and the containers
./scripts/stop-demo.sh

# Also drop the database volumes (fresh start next time)
./scripts/stop-demo.sh --clean
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
# Start database, cache, identity provider and object storage
docker compose up -d postgres redis keycloak minio

# Wait for services to be healthy
docker compose ps
```

Keycloak has to be running even if you only ever use Dev Login: the frontend
calls `keycloak.init({ onLoad: 'check-sso' })` on every page load.

### Step 3: Configure Environment

```bash
cp env.development .env
```

> ⚠️ Use `env.development`. There is no `env.example` at the repository root, and
> `deploy/env.example` is the **production** template — it sets
> `NODE_ENV=production`, which makes `DevAuthGuard` throw so every controls
> endpoint answers HTTP 500.

Leave `VITE_API_URL` empty, as the template ships it: the Vite dev server proxies
each `/api/*` prefix to the service that owns it (`frontend/vite.config.ts`).
Pointing the SPA at a single service breaks every other module.

### Step 4: Create the Database Schema

```bash
# One shared schema for all six services
npm run db:push

# Insert the organization and user that DevAuthGuard hard-codes
docker compose exec -T postgres \
  psql -U grc -d gigachad_grc < database/dev-bootstrap.sql
```

Without those two rows the demo seeder fails with Prisma error `P2025`.

### Step 5: Start Services

**Option A: Docker (All Services)**
```bash
docker compose up -d
```

**Option B: Local Development (Separate Terminals)**

Terminal 1 - Controls API:
```bash
cd services/controls && npm run start:dev
```

Terminal 2 - Frameworks API:
```bash
cd services/frameworks && npm run start:dev
```

Terminal 3 - Frontend:
```bash
cd frontend && npm run dev
```

### Step 6: Access the Application

Open `http://localhost:3000` in your browser.

---

## Loading Demo Data

Once the platform is running, load comprehensive sample data to explore all features.

### Method 1: Via the User Interface (Recommended)

1. **Log in** to the platform
   - Click the **"Dev Login"** button on the login page
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

Development requests need no token — every controller is bound to `DevAuthGuard`,
which fabricates the admin user. Re-running the route returns HTTP **409** once
the organization holds data; reset it first (see
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

## Dev Auth Mode

Dev Auth provides instant access without configuring Keycloak authentication.

### How It Works

1. A **"Dev Login"** button appears on the login page whenever the frontend runs
   under `npm run dev` — it is gated on Vite's `import.meta.env.DEV`
   (`frontend/src/pages/Login.tsx`), so there is nothing to switch on.
2. Clicking it skips Keycloak's login flow.
3. Every backend controller is bound to `DevAuthGuard`, which fabricates a
   full-permission admin user from any request without validating a token.

Keycloak still has to be running: `AuthContext` calls
`keycloak.init({ onLoad: 'check-sso' })` on every page load.

> `VITE_ENABLE_DEV_AUTH` does **not** enable Dev Login. It exists only to make a
> production build fail loudly, so setting it changes nothing in development.

### Dev Auth User Details

| Property | Value |
|----------|-------|
| User ID | `8f88a42b-e799-455c-b68a-308d7d2e9aa4` (John Doe) |
| Email | `john.doe@example.com` |
| Role | `admin` |
| Organization | `8924f0c1-7bb1-4be8-84ee-ad8725c712bf` (default org) |
| Permissions | Full access to all modules |

Those two UUIDs are hard-coded in `services/*/src/auth/dev-auth.guard.ts` and
inserted by `database/dev-bootstrap.sql`.

### Security Note

⚠️ **Never run the development configuration in production.** It has no
authentication at all: `DevAuthGuard` trusts every request, and the real
JWKS-validating `JwtAuthGuard` is wired to zero controllers. `DevAuthGuard`
throws when `NODE_ENV=production`, so a production `.env` turns every controls
endpoint into an HTTP 500 rather than securing it. Keep the demo on loopback.

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

**Solution:** Use Dev Login which provides admin access.

### Dev Login Issues

#### "Dev Login" button not showing

**Cause:** The frontend is not running in Vite's dev mode — the button is gated
on `import.meta.env.DEV`, not on any environment variable. A production build
(`npm run build` + `npm run preview`) never shows it.

**Solution:** Run the dev server.

```bash
cd frontend
npm run dev
```

#### Dev Login gives an error, or every page shows errors

**Cause:** `.env` carries `NODE_ENV=production` — usually from copying
`deploy/env.example`. `DevAuthGuard` throws in production, so every controls
endpoint answers HTTP **500**.

**Solution:** Use the development template and restart the services.

```bash
grep '^NODE_ENV=' .env          # must be development
mv .env .env.production.bak && cp env.development .env
./scripts/stop-demo.sh && ./scripts/start-demo.sh
```

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

---

## Getting Help

- 📖 **Documentation**: Check the `/docs` folder
- 💬 **Discussions**: GitHub Discussions for questions
- 🐛 **Issues**: GitHub Issues for bugs
- 🔒 **Security**: See [SECURITY.md](../SECURITY.md) for vulnerability reporting

---

*Last updated: December 2024*
