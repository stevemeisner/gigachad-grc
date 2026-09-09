# Deployment Guide

This file is an index. It used to carry its own deployment instructions, which
now duplicate — and in places contradicted — the authoritative guides below.

## Where to go

| Goal | Document |
|------|----------|
| **Deploy to production** on one server (Docker Compose, Traefik TLS, nginx gateway, schema, first admin, verification, rollback) | **[Deployment Runbook](./DEPLOYMENT-RUNBOOK.md)** — the authoritative procedure |
| Work out what to buy first (accounts, domain, VM size, monthly cost) | [Hosting Requirements](./HOSTING-REQUIREMENTS.md) |
| Every environment variable, and which ones are build-time | [Configuration](./CONFIGURATION.md), [Env Configuration](./ENV_CONFIGURATION.md) |
| Run it locally to evaluate it, with sample data | [Demo & Sandbox Guide](./DEMO.md) |
| Set up a contributor machine | [Development Guide](./DEVELOPMENT.md) |
| TLS certificate details | [SSL Configuration](./SSL_CONFIGURATION.md) |
| Backups, restore, monitoring, health checks | [Deployment Runbook §9](./DEPLOYMENT-RUNBOOK.md), [System Health](./help/admin/system-health.md), [Monitoring](./help/admin/monitoring.md) |
| Upgrade an existing install | [Upgrade Guide](./UPGRADE.md) |

## The shape of a production deployment

For orientation only — the runbook is the procedure.

- **Ingress.** `gateway/nginx.conf` is the single public entrypoint. It owns 53
  `/api/*` route prefixes with longest-prefix matching and serves the built
  frontend. Traefik sits in front of it for TLS.
- **Services.** Six NestJS services — controls (3001), frameworks (3002),
  policies (3004), tprm (3005), trust (3006), audit (3007) — on an internal
  Docker network with no published ports. There is no service on 3003.
- **Data.** PostgreSQL (one shared Prisma schema, 129 models, applied with
  `prisma db push`) and MinIO for evidence files.
- **Identity.** Firebase Authentication, Google sign-in only. The ID token
  proves which Google account is calling; organization, role and account status
  come from PostgreSQL on every uncached request. `FIREBASE_PROJECT_ID` and
  `ALLOWED_EMAIL_DOMAINS` are required in production; `AUTH_MODE=demo` is the
  single bypass and refuses to start when `NODE_ENV=production`.
- **Compose files.** `docker-compose.prod.yml` is the production stack.
  `docker-compose.yml` is the development/all-in-Docker stack;
  `docker-compose.dev.yml` holds development overrides.

## Alternative architectures

`docs/deployment/supabase-vercel-migration.md` proposes moving to Supabase +
Vercel with an external IdP, and `docs/help/deployment/cloud-deployment.md`
summarises it for non-engineers. Both describe a **proposal**, not something
that has been built or tested: the repository ships no Vercel or Supabase
configuration.

## What this repository does not have

Named here so nobody spends a day looking for it:

- **No Helm chart and no Kubernetes manifests.** An earlier version of this file
  documented a `helm/` directory and a `values.yaml`; neither exists.
- **No per-module extraction tooling.** There is one Prisma schema in
  `services/shared/prisma/schema.prisma`; there is no `schema-controls.prisma`
  and no split-schema generator. The services are separately deployable
  processes, but they share that schema and database.
- **No CI/CD pipeline.** There is no `.github/workflows` directory; deployment
  is the manual procedure in the runbook.
- **No baseline Prisma migration.** `prisma migrate deploy` has nothing to
  apply. `prisma db push` is the supported way to create or update the schema.
