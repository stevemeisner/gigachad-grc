# GigaChad GRC - Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Ingress and Routing](#ingress-and-routing)
4. [Microservices](#microservices)
5. [Infrastructure Components](#infrastructure-components)
6. [Network Architecture](#network-architecture)
7. [Security Architecture](#security-architecture)
8. [Data Flow](#data-flow)
9. [Scalability Considerations](#scalability-considerations)

---

## System Overview

GigaChad GRC is a comprehensive Governance, Risk, and Compliance (GRC) platform built on a microservices architecture. The system is designed for:

- **High Availability**: All components can be scaled horizontally
- **Security**: Defense-in-depth with network isolation, rate limiting, and authentication
- **Modularity**: Independent services that can be developed and deployed separately
- **Observability**: Comprehensive health checks, metrics, and logging

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS |
| **Ingress** | nginx (`gateway/nginx.conf`) behind Traefik v3.0 for TLS |
| **Backend Services** | NestJS, Prisma ORM |
| **Database** | PostgreSQL 16 |
| **Object Storage** | MinIO (S3-compatible) |
| **Authentication** | Firebase Authentication (Google sign-in only); authorization from PostgreSQL |
| **Container Orchestration** | Docker Compose / Kubernetes |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   INTERNET                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                        │                                    │
                        │ :443                               │ Google sign-in
                        ▼                                    ▼
┌──────────────────────────────────────────┐   ┌──────────────────────────────────┐
│  TRAEFIK  (grc-dmz)                      │   │  FIREBASE AUTHENTICATION         │
│  TLS termination, Let's Encrypt,         │   │  (external, Google-hosted)       │
│  :80 → :443 redirect, rate limiting.     │   │  Issues the ID token the browser │
│  Dashboard disabled. Talks to exactly    │   │  sends as a bearer credential.   │
│  one app service: the gateway.           │   │  Identity only - no roles.       │
└──────────────────────────────────────────┘   └──────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     NGINX GATEWAY  :80   (gateway/nginx.conf)                    │
│                                                                                  │
│  The single public entrypoint. Owns ALL path routing: 53 /api prefixes in        │
│  three rewrite classes (34 pass-through, 10 with /api stripped, 9 renamed),      │
│  = /healthz for its own liveness, and the SPA fallback for everything else.      │
│  Prefix matching is longest-match-wins, so the overlapping prefixes are safe     │
│  by construction rather than by declaration order.                               │
└─────────────────────────────────────────────────────────────────────────────────┘
           │                                        │
           ▼ everything else                        ▼ /api/*
┌──────────────────────┐   ┌─────────────────────────────────────────────────────┐
│     FRONTEND         │   │                 MICROSERVICES LAYER                  │
│  React SPA           │   │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  nginx :3000         │   │  │  CONTROLS  │ │ FRAMEWORKS │ │  POLICIES  │       │
│  (PORT is templated) │   │  │   :3001    │ │   :3002    │ │   :3004    │       │
└──────────────────────┘   │  └────────────┘ └────────────┘ └────────────┘       │
                           │  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
┌──────────────────────┐   │  │    TPRM    │ │   TRUST    │ │   AUDIT    │       │
│      MINIO           │   │  │   :3005    │ │   :3006    │ │   :3007    │       │
│  :9000 API           │   │  └────────────┘ └────────────┘ └────────────┘       │
│  :9001 Console       │   │                                                      │
│  (own hostname via   │   │  Every route is guarded by FirebaseAuthGuard, which  │
│   Traefik)           │   │  verifies the token then loads role, permissions and │
└──────────────────────┘   │  organization from PostgreSQL.                       │
                           └─────────────────────────────────────────────────────┘
                                                    │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │  POSTGRESQL  :5432 (5433 published in development)                        │   │
│  │  One database, one `public` schema, 129 Prisma models. The source of      │   │
│  │  truth for the identity-to-user mapping, roles, permission groups and     │   │
│  │  organizations.                                                           │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

There is no cache server, no message broker and no self-hosted identity server
in this picture: caching is in-process, service-to-service calls are
synchronous HTTP, and the identity provider is Google's hosted Firebase
Authentication.

---

## Ingress and Routing

### Two layers, one entrypoint

Production ingress (`docker-compose.prod.yml`) is two components with a strict
division of labour:

| Component | Owns | Does **not** own |
|---|---|---|
| **Traefik v3.0** | TLS termination and Let's Encrypt certificates, the `:80 → :443` redirect, edge rate limiting, and routing `Host(APP_DOMAIN)` to the gateway | Any path routing for the app. Its only app router is `gateway`; MinIO keeps its own host-based routers |
| **nginx gateway** (`gateway/nginx.conf`) | All 53 `/api` prefixes, every path rewrite, `/healthz`, and the SPA fallback | TLS. It listens on plain `:80` inside the Compose network |

The per-service `PathPrefix` labels that used to live on the six API services
have been removed. They could not express the ten `/api`-stripping and nine
renaming routes the frontend depends on, and Traefik matches rules in
declaration order, which made the overlapping prefixes fragile.

### The route table

`gateway/nginx.conf` is the production mirror of the Vite dev proxy table in
`frontend/vite.config.ts`. **Both must change together** — a prefix present in
one and absent from the other is a route that works in exactly one
environment. The 53 prefixes fall into three classes:

| Class | Count | Example | Mechanism |
|---|---|---|---|
| Pass-through | 34 | `/api/controls` → `controls:3001/api/controls` | `proxy_pass` with **no** URI part |
| Strip `/api` | 10 | `/api/vendors/9` → `tprm:3005/vendors/9` | `proxy_pass` **with** a URI, which replaces the matched prefix |
| Rename | 9 | `/api/vendor-assessments` → `tprm:3005/assessments`; `/api/audit/<mod>` → `audit:3007/<mod>` | same mechanism, different target path |

**Precedence.** nginx prefix matching is longest-match-wins and independent of
the order the blocks appear in the file. That is what makes overlapping
prefixes such as `/api/frameworks/catalog` (controls) versus `/api/frameworks`
(frameworks), and the `/api/audit/*` modules versus `/api/audits`, safe here —
the same set of prefixes **is** order-sensitive in the Vite dev proxy, so the
two files are not interchangeable line for line.

### Which service owns which prefix

| Service | Port | Prefixes it owns |
|---|---|---|
| controls | 3001 | `/api/controls`, `/api/evidence`, `/api/implementations`, `/api/dashboard(s)`, `/api/comments`, `/api/tasks`, `/api/integrations`, `/api/notifications`, `/api/users`, `/api/permissions`, `/api/risks`, `/api/assets`, `/api/risk-config`, `/api/risk-scenarios`, `/api/seed`, `/api/employee-compliance`, `/api/training`, `/api/ai`, `/api/mcp`, `/api/system`, `/api/bulk`, `/api/modules`, `/api/config-as-code`, `/api/workspaces`, `/api/frameworks/catalog` |
| frameworks | 3002 | `/api/frameworks`, `/api/assessments`, `/api/mappings` |
| policies | 3004 | `/api/policies` |
| tprm | 3005 | `/api/vendors`, `/api/contracts`, `/api/vendor-assessments`, `/api/tprm-config` |
| trust | 3006 | `/api/questionnaires`, `/api/knowledge-base`, `/api/trust-center`, `/api/trust-config`, `/api/answer-templates`, `/api/trust-ai` |
| audit | 3007 | `/api/audits`, `/api/audit-requests`, `/api/findings`, `/api/audit/templates`, `/api/audit/workpapers`, `/api/audit/test-procedures`, `/api/audit/remediation`, `/api/audit/analytics`, `/api/audit/planning`, `/api/audit/reports` |

Evidence is served by **controls**, not by a service of its own. Nothing
listens on port 3003.

### Rate limiting

Traefik applies an edge limit to the gateway router
(`docker-compose.prod.yml`):

| Setting | Value |
|---|---|
| `ratelimit.average` | 200 requests/second |
| `ratelimit.burst` | 100 |

Each service also throttles in-process — see
[Scalability Considerations](#scalability-considerations) for why that limit is
per-replica.

### TLS

```yaml
# docker-compose.prod.yml, traefik command
- "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
- "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
- "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
- "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
- "--entrypoints.web.http.redirections.entryPoint.to=websecure"
- "--entrypoints.web.http.redirections.entryPoint.scheme=https"
```

The Traefik dashboard is switched off in production
(`--api.dashboard=false`).

### Development

The demo (`./scripts/start-demo.sh`) uses neither component: the Vite dev
server proxies `/api/*` straight to the six host processes. The container stack
in `docker-compose.yml` still carries legacy Traefik `PathPrefix` labels for a
subset of prefixes and is not the supported production topology —
`docker-compose.prod.yml` plus `gateway/nginx.conf` is.

---

## Microservices

### Service Overview

| Service | Port | Responsibility |
|---------|------|----------------|
| **controls** | 3001 | Controls, evidence, assets, implementations, collectors |
| **frameworks** | 3002 | Frameworks, mappings, risk management |
| **policies** | 3004 | Policy lifecycle, approvals, acknowledgments |
| **tprm** | 3005 | Vendors, assessments, contracts |
| **trust** | 3006 | Questionnaires, knowledge base, trust center |
| **audit** | 3007 | Audits, evidence requests, findings, portal |

### Common Service Features

Each service includes:

- **Health Endpoints**: `/health`, `/health/live`, `/health/ready` — the shared
  `HealthModule` from `@gigachad-grc/shared`, wired into all six services
- **Authentication**: `FirebaseAuthGuard` on every route (99 `@UseGuards`
  sites), plus `PermissionGuard` where a specific permission is required
- **Rate Limiting**: In-service rate limiting middleware
- **Caching**: In-process cache with configurable TTL
- **Global Exception Filter**: Standardized error responses
- **Compression**: Gzip response compression
- **Security Headers**: Helmet middleware integration

### Health Check Endpoints

```
GET /health        # Full health check (database, memory)
GET /health/live   # Liveness probe (is the service running?)
GET /health/ready  # Readiness probe (is the service ready for traffic?)
```

The controls service additionally exposes `GET /api/system/health` —
unauthenticated, and the endpoint worth probing from outside a deployment
because it is reachable through the gateway. It answers
`{"status":"healthy","timestamp":…,"service":"controls","version":…}` and is a
liveness ping, not a dependency check. Its richer siblings under `/api/system`
(`health/detailed`, `backup/status`, `setup/status`, `production-readiness`,
`warnings`) report database and configuration detail and all require an
authenticated administrator.

Response format:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  },
  "details": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" }
  }
}
```

---

## Infrastructure Components

### PostgreSQL Database

- **Version**: 16-alpine
- **Port**: 5432 (internal), 5433 (external in dev)
- **Extensions**: uuid-ossp, pg_trgm (full-text search)

**Schemas**:
- `controls` - Control and evidence management
- `frameworks` - Compliance frameworks and risk
- `integrations` - Third-party integrations
- `policies` - Policy management
- `shared` - Cross-cutting concerns

### In-Process Cache

There is no cache server. `CacheService` (`services/shared/src/cache/cache.service.ts`)
is a plain in-memory `Map` with a TTL, living inside each service process.

**Use Cases**:
- Dashboard aggregates (`dashboard.service.ts`)
- Risk scoring intermediates (`risk.service.ts`)

Because the cache is per-process, it is not shared between replicas and is lost
on restart. Nothing depends on it for correctness — it is a latency optimisation
in front of PostgreSQL.

### MinIO Object Storage

- **Version**: Latest
- **API Port**: 9000
- **Console Port**: 9001
- **Compatibility**: S3 API compatible

**Buckets**:
- `evidence` - Evidence artifacts
- `policies` - Policy documents
- `integrations` - Integration data

### Identity: Firebase Authentication

There is no identity server in the deployment. Sign-in is Google's hosted
Firebase Authentication with the **Google provider only**; the app holds no
passwords and runs no login UI of its own beyond a button.

- **Protocol**: OpenID Connect. The browser receives a Firebase ID token
  (RS256 JWT) and sends it as `Authorization: Bearer <token>`.
- **Verification**: `FirebaseAuthGuard`
  (`services/shared/src/auth/firebase-auth.guard.ts`) fetches Google's signing
  keys from
  `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
  and pins the algorithm (`RS256`), the issuer
  (`https://securetoken.google.com/<FIREBASE_PROJECT_ID>`) and the audience
  (`FIREBASE_PROJECT_ID`).
- **Additional assertions**: `email_verified` must be true, the sign-in
  provider must be `google.com`, and `auth_time` must not be in the future.

**The token carries identity only.** Role, permissions and organization are
read from the `users` row on every request, keyed by `users.external_id` =
the token's `sub`. Nothing authorization-relevant is trusted from a claim,
because provider claims refresh at most hourly — a demoted administrator would
otherwise keep their old role until the token expired.

**Who may sign in** is enforced in two places:

| Layer | Mechanism |
|---|---|
| Email domain | `ALLOWED_EMAIL_DOMAINS` compared against the verified email suffix. A Firebase ID token carries no `hd` (hosted-domain) claim, so the suffix is the only signal available |
| Provisioning | A `users` row must exist. With `AUTH_AUTO_PROVISION=false` (the default) an unknown address is rejected with 401 |

**The single bypass** is `AUTH_MODE=demo`, which skips token verification and
loads the seeded demo identity through the same database path. It refuses to
initialise when `NODE_ENV=production`.

---

## Network Architecture

### Development Network

```yaml
networks:
  grc-network:
    driver: bridge
```

### Production Network (DMZ Architecture)

```yaml
networks:
  grc-network:
    driver: bridge
    internal: true  # No external access
    ipam:
      config:
        - subnet: 172.20.0.0/16
  
  grc-dmz:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/16
```

**Network Zones**:

| Zone | Network | Purpose | Components |
|------|---------|---------|------------|
| DMZ | grc-dmz | External-facing | Traefik, nginx gateway, MinIO |
| Internal | grc-network | Backend services | All microservices, PostgreSQL |

---

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Network Perimeter                                  │
│ - Traefik TLS termination                                   │
│ - Edge rate limiting (200 req/s average, burst 100)         │
│ - nginx gateway is the only reachable app service           │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication                                     │
│ - Firebase ID token (RS256, JWKS-verified)                  │
│ - Issuer and audience pinned to the Firebase project        │
│ - Google sign-in only; verified email required              │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Authorization                                      │
│ - Role-based access control (RBAC)                         │
│ - Resource-level permissions                                │
│ - Organization isolation                                    │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Application Security                              │
│ - Input validation (Zod schemas)                           │
│ - SQL injection prevention (Prisma ORM)                    │
│ - XSS prevention (React escaping)                          │
│ - CORS configuration                                        │
├─────────────────────────────────────────────────────────────┤
│ Layer 5: Data Security                                      │
│ - Encryption at rest (PostgreSQL, MinIO)                   │
│ - Encryption in transit (TLS everywhere)                   │
│ - Soft delete (audit trail)                                │
│ - Field-level encryption (sensitive data)                  │
├─────────────────────────────────────────────────────────────┤
│ Layer 6: Container Security                                 │
│ - Non-root users                                            │
│ - Read-only filesystems                                     │
│ - Dropped capabilities                                      │
│ - No new privileges                                         │
└─────────────────────────────────────────────────────────────┘
```

### Container Security

Each container runs with:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
cap_add:
  - (only required capabilities)
read_only: true
tmpfs:
  - /tmp
```

---

## Data Flow

### Request Flow (Authenticated)

```
1. Browser signs in with Google (Firebase) and holds an ID token
   │
   ▼
2. Traefik: TLS termination, edge rate limiting
   │
   ▼
3. nginx gateway: longest-prefix match on the path, proxy to the owning
   service (rewriting /api away where that service expects it)
   │
   ▼
4. Service receives the request with one credential that matters:
   - Authorization: Bearer <Firebase ID token>
   │
   ▼
5. FirebaseAuthGuard verifies signature, issuer, audience, provider and
   verified email, then loads the `users` row and builds `request.user`
   (userId, organizationId, role, status). Identity is NEVER taken from a
   client-supplied header such as `x-user-id` — those are forgeable.
   │
   ▼
6. PermissionGuard resolves the required permission from the database:
   permission group grants, then per-user overrides, then a fallback derived
   from `users.role`
   │
   ▼
7. Service processes request
   │
   ├─► Check in-process cache
   │
   ├─► Query PostgreSQL (always scoped by organizationId)
   │
   └─► Access MinIO (if files)
   │
   ▼
8. Response with security headers
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - etc.
```

### Service-to-Service Communication

Services communicate **synchronously over HTTP** today. There is no message
broker, no queue and no event bus: a service that needs data owned by another
service calls that service's REST API and waits for the response.

An asynchronous event bus was designed and partially written against a pub/sub
server, but it was never wired into any service — no code ever published or
subscribed to an event — so both the bus and its server have been removed
rather than left as misleading scaffolding.
If asynchronous fan-out is needed later, it should be designed against the
requirement that actually motivates it.

---

## Scalability Considerations

### Horizontal Scaling

Every service currently assumes it is the **only** replica of itself. Two things
must be solved before running more than one:

1. **Rate limiting is per-instance.** `ThrottlerModule` in
   `services/controls/src/app.module.ts` is configured with no shared `storage`,
   so each replica counts requests in its own memory and the effective limit
   multiplies by the replica count. The other five services register no
   `ThrottlerModule` at all, so they are not rate limited in-process.
2. **Schedulers are unguarded.** `collectors.scheduler.ts:33` and
   `scheduled-notifications.service.ts:69` (both in `services/controls`) drive
   work from `setInterval`. Every replica would run them, duplicating collector
   runs and sending notifications more than once. The fix is a PostgreSQL
   advisory lock around each scheduled tick, not a new piece of infrastructure.

### Load Balancing

Traefik load balances across replicas of the gateway, and the gateway across
replicas of a service, using plain DNS round-robin inside the Compose network:

```nginx
# gateway/nginx.conf
location /api/controls { proxy_pass http://controls:3001; }
```

### Database Scaling

- **Read Replicas**: Configure PostgreSQL streaming replication
- **Connection Pooling**: Use PgBouncer for connection management
- **Partitioning**: Implement table partitioning for large tables

### Cache Scaling

The cache is an in-process `Map` per service instance, so it does not scale
across replicas — each one warms its own copy. Entries expire by TTL; there is
no cross-instance invalidation. Anything requiring a coherent shared cache would
need a cache server, which the system deliberately does not run today.

### Resource Limits (Production)

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
    reservations:
      cpus: '0.25'
      memory: 256M
```

---

## Next Steps

- [API Documentation](./API.md) - Detailed API reference
- [Deployment Runbook](./DEPLOYMENT-RUNBOOK.md) - Start-to-finish production deployment
- [Hosting Requirements](./HOSTING-REQUIREMENTS.md) - What it needs and what it costs
- [Configuration Reference](./CONFIGURATION.md) - Environment variables
- [Development Guide](./DEVELOPMENT.md) - Local development setup


