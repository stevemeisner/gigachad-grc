# GigaChad GRC - Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [API Gateway (Traefik)](#api-gateway-traefik)
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
| **API Gateway** | Traefik v3.0 |
| **Backend Services** | NestJS, Prisma ORM |
| **Database** | PostgreSQL 16 |
| **Object Storage** | MinIO (S3-compatible) |
| **Authentication** | Keycloak 25 (OAuth 2.0 / OIDC) |
| **Container Orchestration** | Docker Compose / Kubernetes |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   INTERNET                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TRAEFIK API GATEWAY                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   TLS/HTTPS     │  │  Rate Limiting  │  │  Load Balancing │                  │
│  │   Termination   │  │   Middleware    │  │   & Routing     │                  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                  │
│                                                                                  │
│  Entrypoints: :80 (HTTP→HTTPS redirect), :443 (HTTPS)                          │
│  Dashboard: :8080 (internal only)                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│     FRONTEND         │  │     KEYCLOAK         │  │      MINIO           │
│  ┌────────────────┐  │  │  ┌────────────────┐  │  │  ┌────────────────┐  │
│  │  React SPA     │  │  │  │  Auth Server   │  │  │  │ Object Storage │  │
│  │  :80 (nginx)   │  │  │  │  :8080         │  │  │  │ :9000 (API)    │  │
│  └────────────────┘  │  │  └────────────────┘  │  │  │ :9001 (Console)│  │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
                                        │
┌───────────────────────────────────────┼─────────────────────────────────────────┐
│                              MICROSERVICES LAYER                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │   CONTROLS     │  │   FRAMEWORKS   │  │   POLICIES     │  │     TPRM       │ │
│  │   :3001        │  │   :3002        │  │   :3004        │  │   :3005        │ │
│  │                │  │                │  │                │  │                │ │
│  │ /api/controls  │  │ /api/frameworks│  │ /api/policies  │  │ /api/vendors   │ │
│  │ /api/evidence  │  │ /api/risks     │  │                │  │ /api/contracts │ │
│  │ /api/assets    │  │ /api/risk-*    │  │                │  │ /api/assess*   │ │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘ │
│                                                                                  │
│  ┌────────────────┐  ┌────────────────┐                                         │
│  │    TRUST       │  │    AUDIT       │                                         │
│  │   :3006        │  │   :3007        │                                         │
│  │                │  │                │                                         │
│  │ /api/quest*    │  │ /api/audits    │                                         │
│  │ /api/knowledge │  │ /api/audit-*   │                                         │
│  │ /api/trust-*   │  │ /api/findings  │                                         │
│  └────────────────┘  └────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                          │
│  ┌────────────────────────────────────┐                                         │
│  │          POSTGRESQL                │                                         │
│  │          :5432                     │                                         │
│  │                                    │                                         │
│  │  Schemas:                          │                                         │
│  │  - controls                        │                                         │
│  │  - frameworks                      │                                         │
│  │  - integrations                    │                                         │
│  │  - policies                        │                                         │
│  │  - shared                          │                                         │
│  └────────────────────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## API Gateway (Traefik)

### Overview

Traefik v3.0 serves as the API gateway and reverse proxy for all GigaChad GRC services. It provides:

- **Automatic Service Discovery**: Via Docker labels
- **TLS Termination**: Automatic HTTPS with Let's Encrypt
- **Load Balancing**: Round-robin across service instances
- **Rate Limiting**: Protection against abuse
- **Request Routing**: Path-based routing to microservices
- **Health Checks**: Continuous monitoring of backend services

### Configuration

#### Entry Points

| Entry Point | Port | Purpose |
|-------------|------|---------|
| `web` | 80 | HTTP (redirects to HTTPS in production) |
| `websecure` | 443 | HTTPS (primary entry point) |
| `traefik` | 8080 | Dashboard (internal only) |

#### Static Configuration (`gateway/traefik.yml`)

```yaml
# API Dashboard
api:
  dashboard: true
  insecure: true  # Only in development

# Logging
log:
  level: INFO
  format: common

accessLog:
  format: common

# Entry Points
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

# Docker Provider
providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false  # Must explicitly enable services
    network: grc-network
    watch: true

# Health Check Endpoint
ping:
  entryPoint: web
```

### Routing Configuration

Routes are defined via Docker labels on each service. The pattern:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.{name}.rule=Host(`${APP_DOMAIN}`) && PathPrefix(`/api/{path}`)"
  - "traefik.http.routers.{name}.entrypoints=websecure"
  - "traefik.http.routers.{name}.tls.certresolver=letsencrypt"
  - "traefik.http.services.{name}.loadbalancer.server.port={port}"
```

### API Route Mapping

| Route Prefix | Service | Port | Description |
|--------------|---------|------|-------------|
| `/api/controls` | controls | 3001 | Security controls management |
| `/api/evidence` | controls | 3001 | Evidence/artifact management |
| `/api/assets` | controls | 3001 | Asset inventory |
| `/api/implementations` | controls | 3001 | Control implementations |
| `/api/ai` | controls | 3001 | AI configuration and features |
| `/api/mcp` | controls | 3001 | MCP server management |
| `/api/training` | controls | 3001 | Training management |
| `/api/frameworks` | frameworks | 3002 | Compliance frameworks |
| `/api/risks` | frameworks | 3002 | Risk register |
| `/api/risk-config` | frameworks | 3002 | Risk configuration |
| `/api/policies` | policies | 3004 | Policy management |
| `/api/vendors` | tprm | 3005 | Vendor management |
| `/api/assessments` | tprm | 3005 | Vendor assessments |
| `/api/contracts` | tprm | 3005 | Contract management |
| `/api/questionnaires` | trust | 3006 | Security questionnaires |
| `/api/knowledge-base` | trust | 3006 | Knowledge base entries |
| `/api/trust-center` | trust | 3006 | Public trust center |
| `/api/audits` | audit | 3007 | Audit management |
| `/api/audit-requests` | audit | 3007 | Evidence requests |
| `/api/audit-findings` | audit | 3007 | Audit findings |
| `/api/audit-portal` | audit | 3007 | Auditor portal |

### Rate Limiting

Traefik applies rate limiting middleware to protect services:

```yaml
labels:
  - "traefik.http.middlewares.{service}-ratelimit.ratelimit.average=100"
  - "traefik.http.middlewares.{service}-ratelimit.ratelimit.burst=50"
  - "traefik.http.routers.{service}.middlewares={service}-ratelimit"
```

| Setting | Value | Description |
|---------|-------|-------------|
| `average` | 100 | Requests per second (average) |
| `burst` | 50 | Maximum burst size |

### TLS Configuration (Production)

```yaml
command:
  # Automatic HTTPS via Let's Encrypt
  - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
  - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
  - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
  - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  
  # HTTP to HTTPS redirect
  - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
  - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
```

### Dashboard Access

- **Development**: `http://localhost:8090`
- **Production**: Disabled by default for security

To access the dashboard in production, use port forwarding:

```bash
kubectl port-forward svc/traefik 8080:8080
```

### Health Check Endpoints

| Endpoint | Description |
|----------|-------------|
| `/ping` | Traefik health check |
| `/api` | Traefik API (if enabled) |
| `/dashboard/` | Web dashboard (if enabled) |

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

- **Health Endpoints**: `/health`, `/health/live`, `/health/ready`
- **Rate Limiting**: In-service rate limiting middleware
- **Caching**: In-memory cache with configurable TTL
- **Global Exception Filter**: Standardized error responses
- **Compression**: Gzip response compression
- **Security Headers**: Helmet middleware integration

### Health Check Endpoints

```
GET /health        # Full health check (DB, memory, etc.)
GET /health/live   # Liveness probe (is the service running?)
GET /health/ready  # Readiness probe (is the service ready for traffic?)
```

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

### Keycloak Authentication

- **Version**: 25
- **Port**: 8080
- **Protocol**: OAuth 2.0 / OpenID Connect

**Features**:
- Single Sign-On (SSO)
- Multi-factor authentication
- Role-based access control
- Social identity providers

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
| DMZ | grc-dmz | External-facing | Traefik, Frontend, Keycloak, MinIO |
| Internal | grc-network | Backend services | All microservices, PostgreSQL |

---

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Network Perimeter                                  │
│ - Traefik TLS termination                                   │
│ - Rate limiting (100 req/min)                               │
│ - IP filtering (optional)                                   │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Authentication                                     │
│ - Keycloak OAuth 2.0 / OIDC                                │
│ - JWT validation                                            │
│ - Session management                                        │
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
1. Client Request
   │
   ▼
2. Traefik (TLS termination, rate limiting)
   │
   ▼
3. Service receives request with headers:
   - Authorization: Bearer <JWT>
   - x-user-id: <user-uuid>
   - x-organization-id: <org-uuid>
   │
   ▼
4. Service validates JWT (optional Keycloak verification)
   │
   ▼
5. Service checks authorization (RBAC)
   │
   ▼
6. Service processes request
   │
   ├─► Check in-process cache
   │
   ├─► Query PostgreSQL
   │
   └─► Access MinIO (if files)
   │
   ▼
7. Response with security headers
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - etc.
```

### Service-to-Service Communication

Services communicate **synchronously over HTTP** today. There is no message
broker, no queue and no event bus: a service that needs data owned by another
service calls that service's REST API and waits for the response.

An asynchronous event bus (Redis pub/sub) was designed and partially written,
but it was never wired into any service — no code ever published or subscribed
to an event — so it has been removed rather than left as misleading scaffolding.
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

Traefik automatically load balances across service replicas:

```yaml
- "traefik.http.services.controls.loadbalancer.server.port=3001"
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
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment steps
- [Configuration Reference](./CONFIGURATION.md) - Environment variables
- [Development Guide](./DEVELOPMENT.md) - Local development setup


