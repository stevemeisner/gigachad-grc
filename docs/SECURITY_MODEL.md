# GigaChad GRC Security Model

This document provides a comprehensive overview of the security architecture, authentication mechanisms, authorization controls, and best practices implemented in the GigaChad GRC platform.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication](#authentication)
3. [Authorization](#authorization)
4. [Module Configuration Security](#module-configuration-security)
5. [Tenant Isolation](#tenant-isolation)
6. [Audit Logging](#audit-logging)
7. [Frontend Security](#frontend-security)
8. [Deployment Hardening](#deployment-hardening)
9. [Production Readiness Checklist](#production-readiness-checklist)

---

## Architecture Overview

### Defense in Depth

The platform implements multiple layers of security:

```
┌─────────────────────────────────────────────────────────────┐
│                     CDN / WAF Layer                         │
│              (Cloudflare, AWS CloudFront)                   │
├─────────────────────────────────────────────────────────────┤
│                  TLS Termination (Traefik)                  │
│      nginx Gateway: 53 API routes, longest-prefix match     │
├─────────────────────────────────────────────────────────────┤
│                  Authentication Layer                       │
│   Firebase ID token: RS256 signature, issuer + audience     │
│   pinned to FIREBASE_PROJECT_ID, email_verified and         │
│   google.com provider asserted (FirebaseAuthGuard)          │
├─────────────────────────────────────────────────────────────┤
│                     Authorization Layer                     │
│      PostgreSQL permission groups + per-user overrides,     │
│ users.role fallback, resource-level scope (PermissionGuard) │
├─────────────────────────────────────────────────────────────┤
│                   Application Layer                         │
│          Input Validation, Business Logic                   │
├─────────────────────────────────────────────────────────────┤
│                     Data Layer                              │
│     Tenant Isolation, Encryption at Rest, Audit Logs        │
└─────────────────────────────────────────────────────────────┘
```

### Network Segmentation

- **Public Zone**: CDN, Load Balancer
- **DMZ**: nginx gateway (`gateway/nginx.conf`), the single public entrypoint
- **Application Zone**: Backend Services (Controls, Frameworks, etc.)
- **Data Zone**: PostgreSQL, MinIO (Object Storage)

---

## Authentication

### Identity Provider: Firebase Authentication (Google sign-in only)

Firebase Authentication is the platform's only identity provider, and Google
is its only enabled sign-in method. There is no local password store, no
self-registration and no second identity system to keep in sync.

`FirebaseAuthGuard` (`services/shared/src/auth/firebase-auth.guard.ts`,
exported from `@gigachad-grc/shared`) is the **only** authentication guard in
the codebase and is applied at every `@UseGuards` site across the six
services.

```typescript
// Frontend configuration — all three values are build-time, all three public
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};
```

The Firebase **Web API key is not a secret**. It is a public client
identifier that ships inside the browser bundle by design and grants nothing
on its own.

**Token flow:**

1. The browser calls `signInWithPopup` with `GoogleAuthProvider`.
2. Firebase returns a signed ID token (JWT). The frontend holds it in memory
   only — it is never written to `localStorage` or `sessionStorage`, because a
   stored copy goes stale within the hour. The Firebase SDK owns the refresh
   credential and refreshes the ID token silently.
3. API requests carry `Authorization: Bearer <Firebase ID token>`.
4. `FirebaseAuthGuard` verifies the token and then resolves the caller's
   identity **from PostgreSQL**.

### What the guard verifies

Every check below is enforced server-side on every request.

| Check | Detail |
|-------|--------|
| Algorithm | Header `alg` must be `RS256`; anything else is rejected before signature work |
| Signature | Verified against Google's JWKS at `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`, keyed by the token's `kid` (cached 10 minutes, rate-limited) |
| Issuer | Must equal `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` |
| Audience | Must equal `FIREBASE_PROJECT_ID` |
| Expiry / skew | Standard `exp` validation with 60 seconds of clock tolerance |
| `auth_time` | Must be present and not in the future — a token cannot claim a sign-in that has not happened |
| `email_verified` | Must be `true` |
| Sign-in provider | `firebase.sign_in_provider` must be `google.com` |
| `email` | Must be present; lowercased before use |

`FIREBASE_PROJECT_ID` is mandatory: the guard refuses to construct without it
rather than accept a token from an unknown project.

### Who is allowed in: two enforced layers

A Firebase ID token does **not** carry Google's `hd` (hosted domain) claim,
so nothing in the token proves the holder belongs to your Workspace. Two
independent server-side layers do that work:

| Layer | Variable | Behaviour |
|-------|----------|-----------|
| **Email domain allowlist** | `ALLOWED_EMAIL_DOMAINS` | Comma-separated (e.g. `example.com,example.co.uk`); entries are lowercased and a leading `@` stripped. A mismatch is **403**. An empty value disables the check — never do that in production |
| **A provisioned `users` row** | `AUTH_AUTO_PROVISION` (default `false`) | With the default, an address with no matching `users` row is refused **401** whatever domain it came from. This is the layer that means "you must be given an account", not merely "you work here" |

- A pre-created row carrying a placeholder `external_id` is claimed on first
  sign-in: the guard matches it by verified email and rewrites `external_id`
  to the real Firebase subject.
- `AUTH_AUTO_PROVISION=true` requires `AUTH_DEFAULT_ORG_ID`; the guard throws
  at construction otherwise rather than guess an organization. Auto-provisioned
  accounts are created as `viewer`.
- A row whose `status` is not `active` is refused **403** even with a valid
  token, so suspension takes effect without revoking anything at Google.
- `VITE_ALLOWED_EMAIL_DOMAIN` (singular, frontend, build-time) **restricts
  nothing**. It is passed to Google as the `hd` parameter only to pre-filter
  the account chooser. Never rely on it.

### The token proves identity, nothing more

No authorization decision reads a token claim. Once the token is verified,
the guard builds `request.user` entirely from the `users` row:

```typescript
const context: UserContext = {
  userId: user.id,              // database id — what every foreign key points at
  externalId: payload.sub,      // Firebase subject, for lookup only
  email: user.email,
  organizationId: user.organizationId,
  role: user.role,
  permissions: [],              // resolved separately; empty grants nothing
  displayName: user.displayName,
};
```

This is deliberate: Firebase custom claims refresh at most hourly, so a role
carried in the token would let a demoted or revoked administrator keep their
old rights until the token expired. Resolved identities are cached for 30
seconds keyed by Firebase `sub`, which bounds that window to seconds instead.

`users.external_id` (Prisma `externalId`) holds the Firebase subject. Look a
user up with `GET /api/users/external/:externalId`.

### The single authentication bypass

`AUTH_MODE=demo` on the backend serves **every** request as the seeded demo
administrator without verifying any token, for local demos only. It is
resolved through the same database path as a real sign-in, so the two cannot
diverge, and auto-provisioning is off for it on purpose.

**It hard-throws when `NODE_ENV=production`** — the check runs both in the
guard's constructor (so services refuse to boot) and again on every request.
The frontend counterpart requires `VITE_AUTH_MODE=demo` **and**
`import.meta.env.DEV`, so it cannot be compiled into a production bundle at
all.

This is the only bypass in the system.

### Session Management

- **ID token lifetime**: one hour, set by Firebase and not configurable here
- **Refresh**: handled by the Firebase SDK; a single `onIdTokenChanged`
  subscription covers session restore, sign-in, sign-out and silent refresh
- **ID token storage**: in memory only, never persisted
- **Sign-out**: `signOut()` plus local state clear; the SDK discards the
  refresh credential
- **CSRF**: the API is bearer-token authenticated, not cookie authenticated,
  so a cross-site request cannot ride an ambient session. CORS origins are
  restricted with `CORS_ORIGINS`
- **Identity cache**: 30 seconds server-side, so a role, status or
  organization change takes effect within 30 seconds

---

## Authorization

### Where authorization comes from

**Not from the token.** The Firebase ID token carries no role, no
organization and no permission claim, and the guard reads none. Authorization
is resolved from PostgreSQL for every decision:

1. The `PermissionGroup` rows the user belongs to (`source: 'group'`).
2. Per-user overrides layered on top, which can also *remove* a permission
   (`source: 'override'`).
3. If the user has neither, a fallback derived from their `users.role` column
   (`source: 'role'`), mapped onto one of the default group templates:
   `admin → Administrator`, `compliance_manager → Compliance Manager`,
   `auditor → Auditor`, `viewer → Viewer`.

The role fallback exists so a freshly provisioned user is not 403 on every
route before an administrator puts them in a group. An explicit group or
override always wins over it, so a group that deliberately narrows a user is
never overruled by their role. `EffectivePermissionDto.source` records which
of the three granted a permission.

### Role-Based Access Control (RBAC)

A permission is a `(resource, actions, scope)` triple:

#### Resources
```typescript
enum Resource {
  CONTROLS = 'controls',
  EVIDENCE = 'evidence',
  POLICIES = 'policies',
  FRAMEWORKS = 'frameworks',
  INTEGRATIONS = 'integrations',
  AUDIT_LOGS = 'audit_logs',
  USERS = 'users',
  PERMISSIONS = 'permissions',
  SETTINGS = 'settings',
  DASHBOARD = 'dashboard',
  WORKSPACES = 'workspaces',
  RISK = 'risk',
  BCDR = 'bcdr',
  REPORTS = 'reports',
  AI = 'ai',
}
```

#### Actions
```typescript
enum Action {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  ASSIGN = 'assign',
  APPROVE = 'approve',
  EXPORT = 'export',
}
```

#### Scope
```typescript
enum OwnershipScope {
  ALL = 'all',            // any item in the organization
  OWNED = 'owned',        // only items the caller owns
  ASSIGNED = 'assigned',  // only items assigned to the caller
}
```

Scope is checked against the concrete resource, so `controls:update` with
`ASSIGNED` ownership fails on a control the caller is not assigned to. Tag
and category scopes narrow further.

### Permission Guard

API endpoints are protected using the `@RequirePermission` decorator:

```typescript
@Controller('api/controls')
@UseGuards(FirebaseAuthGuard, PermissionGuard)
export class ControlsController {

  @Get()
  @RequirePermission(Resource.CONTROLS, Action.READ)
  async findAll(@OrgId() organizationId: string) { /* ... */ }

  @Post()
  @RequirePermission(Resource.CONTROLS, Action.CREATE)
  async create(@Body() dto: CreateControlDto) { /* ... */ }

  @Delete(':id')
  @RequirePermission(Resource.CONTROLS, Action.DELETE)
  async delete(@Param('id') id: string) { /* ... */ }
}
```

`PermissionGuard` takes the user id from `request.user.userId` — populated by
`FirebaseAuthGuard` from a verified token — and never from an `x-user-id`
header, which any caller could set. A route carrying no `@RequirePermission`
decorator is authenticated but not permission-checked.

### Permission Groups

Group membership is the primary source of permissions. The templates shipped
in `DEFAULT_PERMISSION_GROUPS` are:

| Template | Description | Permissions |
|----------|-------------|-------------|
| Administrator | Full access to all resources and actions | Every resource, all actions (`audit_logs` is read + export only) |
| Compliance Manager | Manage controls, evidence, and policies | Controls (read/create/update/assign), Evidence and Policies (read/create/update/approve), Risk and BCDR (read/create/update), Workspaces (read/create/update/assign), Reports (read/export), Frameworks / Integrations / Audit Logs / Dashboard / AI (read) |
| Auditor | Read-only with evidence approval | Controls, Policies, Frameworks, Dashboard, Workspaces, Risk, BCDR (read), plus `evidence:approve`; Audit Logs and Reports also export |
| Control Owner | Edit assigned controls and link evidence | Controls (read/update, **assigned** only), Evidence (read/create/update, **owned** only), Policies / Frameworks / Dashboard / Workspaces (read) |
| Viewer | Read-only access to non-sensitive data | Controls, Evidence, Policies, Frameworks, Dashboard, Workspaces (read) |

`control_owner` is a group template only — there is no matching `users.role`
value, so it cannot be reached through the role fallback and has to be
assigned as a group.

---

## Module Configuration Security

### Organization-Level Module Control

Administrators can enable/disable platform modules per organization:

```typescript
// Stored in Organization.settings JSONB column
{
  "enabledModules": ["compliance", "risk", "tprm", "bcdr", "audit"]
}
```

### Module Guard (Frontend)

The `ModuleGuard` component prevents access to disabled modules:

```tsx
<ModuleGuard moduleId="risk">
  <RiskDashboard />
</ModuleGuard>
```

### API-Level Module Checks

Backend endpoints can verify module status before processing:

```typescript
if (!await this.isModuleEnabled(orgId, 'risk')) {
  throw new ForbiddenException('Risk module is not enabled');
}
```

---

## Tenant Isolation

### Database-Level Isolation

All queries are automatically scoped to the user's organization:

```typescript
// Every query includes organizationId filter
const controls = await this.prisma.control.findMany({
  where: {
    organizationId: user.organizationId,
    deletedAt: null,
  },
});
```

### Parameter-Decorator Enforcement

Controllers take the tenant from the verified identity, never from the wire.
`@OrgId()`, `@UserId()`, `@UserEmail()` and `@AuthUser()`
(`services/shared/src/auth/identity.decorators.ts`) read `request.user`,
which only `FirebaseAuthGuard` populates:

```typescript
// 103 call sites across the six services
async findAll(@OrgId() organizationId: string) { /* ... */ }
```

They fail closed: on a route with no auth guard `request.user` is undefined
and the decorator throws **401** rather than hand the handler `undefined`,
which would previously have widened the query to every organization.

### Cross-Tenant Access Prevention

- Controllers never read `x-organization-id` or `x-user-id` from request
  headers. Those values are client-supplied and cannot be trusted
- Organization context comes from the caller's `users` row, resolved
  server-side after token verification
- Database constraints enforce foreign key relationships

---

## Audit Logging

### Comprehensive Audit Trail

All significant actions are logged to the `AuditLog` table:

```typescript
await this.auditService.log({
  organizationId: user.organizationId,
  userId: user.userId,
  userEmail: user.email,
  userName: user.name,
  action: 'control.update',
  entityType: 'control',
  entityId: controlId,
  entityName: control.title,
  description: 'Updated control implementation status',
  changes: {
    before: { status: 'not_started' },
    after: { status: 'implemented' },
  },
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
});
```

### Immutability

The audit API is read-only. `services/controls/src/audit/audit.controller.ts`
exposes `GET` routes only — list, stats, export, filters, by entity and by
id — so no request can alter or remove an audit record.

Nothing below the API level enforces that. There is no database trigger, no
write-once storage and no object-lock integration, so anyone with direct
database access can still modify the table. The application applies no
retention policy to `AuditLog` either: records accumulate until someone
prunes them deliberately.

---

## Frontend Security

### Content Security Policy

The API services apply `helmet` in each service's `main.ts` with
`contentSecurityPolicy: false`: they serve JSON rather than documents, so a
CSP on those responses would protect nothing.

The browser-facing headers come from the frontend container's nginx
configuration (`frontend/nginx.conf.template`), which sends
`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and
`X-XSS-Protection: 1; mode=block`. It does **not** send a
`Content-Security-Policy` header today.

### XSS Prevention

- React's built-in escaping
- DOMPurify for user-generated HTML
- No `dangerouslySetInnerHTML` without sanitization

### Token Handling

The Firebase ID token is **not stored**. `AuthContext` keeps it in React
state for the lifetime of the page and re-reads it from the SDK whenever it
changes:

```typescript
// Never persisted: the SDK owns the refresh credential, and a stored copy of
// the ID token goes stale within the hour.
onIdTokenChanged(auth, async (firebaseUser) => {
  const idToken = await firebaseUser.getIdToken();
  setToken(idToken);
});
```

**Why nothing is written to storage:**
- No long-lived bearer token sits in `localStorage` for an XSS payload to
  exfiltrate
- The token is a bearer credential, not a cookie, so no cross-site request
  can ride an ambient session
- The Firebase SDK owns the refresh credential and the hourly renewal

The one `sessionStorage` key the app writes is `grc-demo-session`, which only
marks the `AUTH_MODE=demo` bypass as active across a page refresh in a
development build. It holds no credential.

---

## AI & Integration Security

### AI provider credentials

The AI provider API keys are **environment variables only**:
`OPENAI_API_KEY` and `ANTHROPIC_API_KEY`, read by
`services/controls/src/ai/providers/`. They are not stored in the database
and there is no UI field for them, so they are protected by the file
permissions on `.env.prod` and nothing else.

What the application stores per organization (in the `Organization.settings`
JSONB column, unencrypted, because none of it is a credential) is the
provider choice, model name, enabled flag, temperature and token ceiling.
Changing it requires the `settings:update` permission.

Before enabling AI features, decide what control, risk and policy text may
leave your network: prompts go to the provider you configure.

### Integration credentials

Credentials for the connectors the product collects evidence **from** — AWS,
Azure, GitHub, Okta, Keycloak, Datadog and the rest under
`services/controls/src/integrations/connectors/` — are encrypted before
storage by `IntegrationsService`, using AES-256-GCM with a key derived from
`ENCRYPTION_KEY` (`iv:authTag:ciphertext`). The service refuses to start
with a missing or too-short `ENCRYPTION_KEY`.

> Keycloak appears in that list as a **third-party system this product reads
> evidence from**, in the same way as Okta or AWS. It is not part of signing
> in to GigaChad GRC — that is Firebase, described above.

Give each connector the least privilege that still collects the evidence:

| Provider | Auth method | Suggested minimum |
|----------|-------------|-------------------|
| AWS | Access keys | Read-only resource access |
| Azure | Service principal | Reader role |
| GitHub | Personal access token | `read:org`, repository read |
| Okta | API token | Read-only administrator |

### FieldGuide integration

`services/audit/src/fieldguide/` authenticates with a **shared API key**, not
OAuth. Two things to know before enabling it:

- The API key is persisted as supplied. Unlike the connector credentials
  above, it does not go through `IntegrationsService`, so it is not
  encrypted at rest — the source says so in as many words.
- Inbound webhooks are verified against a shared `webhookSecret` and
  rejected with 400 on a signature mismatch.

### MCP servers

The MCP servers are defined in
`services/controls/src/mcp/mcp-servers.config.ts`, not by environment
variables. Each runs as a child process spawned by
`services/controls/src/mcp/mcp-client.service.ts`, which:

- refuses any command outside an allowlist (`node`, `npx`, `npm`, `python`,
  `python3`), so a tampered configuration cannot run an arbitrary binary
- communicates over the process's stdio, not a network socket
- applies a start-up readiness timeout (10s default) and a per-request
  timeout (30s default)

Credentials the MCP servers need are stored by
`services/controls/src/mcp/mcp-credentials.service.ts`, encrypted with
AES-256-GCM.

---

## Deployment Hardening

### Environment Variables

**Never commit secrets to version control.**

Required production secrets:
- `DATABASE_URL` (or `POSTGRES_PASSWORD`) — PostgreSQL credentials
- `ENCRYPTION_KEY` — encrypts stored integration credentials; losing it makes
  them unreadable

The application signs no tokens of its own, so it holds no signing secret:
sign-in is Firebase, and its RS256 ID tokens are verified against Google's
JWKS with the issuer and audience pinned to `FIREBASE_PROJECT_ID`.

Required production authentication settings (none of these is a secret):
- `FIREBASE_PROJECT_ID` — pins the accepted token issuer and audience
- `ALLOWED_EMAIL_DOMAINS` — the email domain allowlist
- `AUTH_AUTO_PROVISION` — leave `false` so a `users` row must exist
- `AUTH_DEFAULT_ORG_ID` — only when auto-provisioning is enabled
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID` — build-time browser config; the Web API key is a
  public client identifier, not a secret
- `AUTH_MODE` — leave unset. `AUTH_MODE=demo` is the only bypass and the guard
  hard-throws when `NODE_ENV=production`

### TLS

Traefik terminates TLS with a Let's Encrypt certificate and redirects the
`web` entrypoint to `websecure`. It runs on Traefik's defaults: TLS 1.2 and
1.3 with its default cipher list. **No HSTS header is configured** — nothing
in `docker-compose.prod.yml` or the nginx configurations sends
`Strict-Transport-Security`. Add it deliberately if you want it.

### Rate limiting

Two independent layers, both with fixed limits:

| Layer | Where | Limit |
|---|---|---|
| Traefik middleware on the gateway router | `docker-compose.prod.yml` labels | average 200 requests, burst 100 |
| `@nestjs/throttler` inside the controls service | `services/controls/src/app.module.ts` | 5 per second, 30 per 10 seconds, 100 per minute |

`CustomThrottlerGuard` (`services/controls/src/auth/throttler.guard.ts`)
buckets by API key hash, then by user id plus IP for an authenticated
caller, and by IP otherwise. The other five services have no throttler of
their own; the Traefik middleware is the only limit in front of them.

> The throttler's numbers are hard-coded. `RATE_LIMIT_MAX` and
> `RATE_LIMIT_WINDOW_MS` are **not read by any service** — setting them
> changes nothing. `RATE_LIMIT_ENABLED` is read only by the in-app
> production-readiness report, not by the throttler.

### Database

- Prisma pools connections in-process and parameterizes every query it
  builds, so injection is not reachable through the ORM
- PostgreSQL publishes no port: `grc-network` is `internal: true`
- The container runs read-only, drops all capabilities except the five
  PostgreSQL needs to manage its data directory, and sets
  `no-new-privileges`
- The application connects as the `POSTGRES_USER` account, which owns the
  schema. There is no separate least-privilege application role

---

## Production Readiness Checklist

### Authentication & Authorization
- [ ] `FIREBASE_PROJECT_ID` set to the production Firebase project
- [ ] Google is the only enabled sign-in method in that project
- [ ] The app's public hostname is in Firebase → Authentication → Settings →
      Authorized domains
- [ ] `ALLOWED_EMAIL_DOMAINS` set (never empty in production)
- [ ] `AUTH_AUTO_PROVISION=false`, or `AUTH_DEFAULT_ORG_ID` set alongside it
- [ ] `AUTH_MODE` unset — `npm run validate:production` checks this
- [ ] First administrator `users` row created (see the deployment runbook)
- [ ] Permission groups defined and assigned

### Network Security
- [ ] TLS certificates installed and valid
- [ ] CORS origins restricted to known domains
- [ ] Rate limiting enabled
- [ ] WAF rules configured (if applicable)

### Data Protection
- [ ] Database encryption at rest enabled
- [ ] Backup encryption enabled
- [ ] Audit log retention configured
- [ ] PII handling documented

### Monitoring & Alerting
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Security event alerts configured
- [ ] Failed login attempt monitoring
- [ ] Unusual access pattern detection

### Compliance
- [ ] Security policy documented
- [ ] Incident response plan defined
- [ ] Data retention policies configured
- [ ] Access reviews scheduled

---

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainers
3. Include detailed reproduction steps
4. Allow 90 days for remediation before disclosure

See [SECURITY.md](../SECURITY.md) for the full security policy.

