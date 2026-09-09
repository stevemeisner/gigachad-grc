# Hosting Requirements

What you actually need to run GigaChad GRC for real, what it costs, and what
must be built first. Written for someone who is not a cloud specialist.

Everything here was checked against this repository. Prices were observed on
**2026-09-09** and link to the vendor's own page — re-check before committing.

---

## Jargon, once

| Term | Meaning |
|---|---|
| **IdP** (identity provider) | The service that owns usernames and passwords and hands out login tokens. Your app never sees the password. Keycloak is one. Okta, Auth0, Google Identity Platform are others. |
| **SSO** (single sign-on) | Logging in once at the IdP instead of the app keeping its own passwords. |
| **JWT** | The signed digital ticket the IdP gives your browser after login. The browser attaches it to every API call. |
| **JWKS** | A public web address where the IdP publishes the keys used to sign those tickets, so the API can verify them. Read-only; nothing secret is shared. |
| **Claim** | One field inside the token. This app needs two custom ones: `roles` and `organization_id`. |
| **MAU** | Monthly active user — someone who logged in at least once that month. Most IdPs bill this way. |
| **ROPC** | An obsolete login mode where the app collects the password itself instead of redirecting to the IdP. Breaks multi-factor auth. Currently switched **on** in this repo and should be off. |

---

## Read this first: the app cannot be deployed as-is

The development stack has **no authentication at all**. Every API route is
protected by `DevAuthGuard`, which invents a full-permission administrator for
any request that arrives — it never looks at a password or a token. The real
token-checking code (`services/shared/src/auth/jwt.guard.ts`) exists but is
connected to **zero** routes.

The browser app's "Dev Login" button is compiled out of production builds
(it is gated on Vite's `import.meta.env.DEV`). So the moment you deploy,
**there is no way to log in until real SSO is finished.** SSO is not an
enhancement here; it is the thing that makes deployment possible.

See [Work required before deploying](#work-required-before-deploying).

---

## Required accounts and services

For a small internal deployment (10–50 people).

| Thing | Required? | Notes |
|---|---|---|
| **Domain name** | **Required** | One hostname for the app. A second (e.g. `auth.yourdomain.com`) if you self-host Keycloak. |
| **TLS certificate** | **Required** | Free via Let's Encrypt. `docker-compose.prod.yml` already runs Traefik configured to obtain them automatically. |
| **PostgreSQL 16** | **Required** | The only datastore. One database for the app, a second for Keycloak if self-hosted. Managed (Cloud SQL / RDS) or the container in the compose file. |
| **Identity provider** | **Required** | See [Identity provider options](#identity-provider-options). |
| **Object storage (S3 etc.)** | **Optional** | Only for evidence file uploads. `STORAGE_TYPE=local` writes to disk instead and needs a persistent volume. Start local; add S3 when you need durability or multiple app instances. |
| **Redis** | **Not needed** | Verified unused: `EVENT_BUS` is injected nowhere, `publish()` has no call sites, `ioredis` is imported in exactly one file, and rate limiting is in-memory. Do not provision it. |
| **SMTP / email** | **Optional** | Nothing in the demo path sends mail. Password-reset links will silently fail without it. |
| **OpenAI / Anthropic API key** | **Optional** | Only the AI assist features need one. Everything else works without. |

---

## Identity provider options

The app needs exactly two things from whichever provider you pick: a token
containing a `roles` array and an `organization_id`, and a JWKS address to
verify it.

**It is only lightly welded to Keycloak.** Two strings in
`services/shared/src/auth/jwt.guard.ts` hardcode Keycloak's URL shape (the
JWKS URI at line 34 and the expected issuer at line 106). Replacing them with
two environment variables is roughly a ten-line change in one file. The guard
already accepts a flat `roles` array as an alternative to Keycloak's nested
format — it was written to be provider-agnostic.

| Provider | Cost, 10–200 internal users | Effort to adopt | Notes |
|---|---|---|---|
| **Keycloak, self-hosted** (status quo) | **$0** licence, plus ~$12–58/mo to run it | **No code change** | The realm already emits both required claims. You operate it: upgrades, backups, TLS. |
| **Google Cloud Identity Platform** | **$0** (free to 50,000 MAU) | ~1 day | Claims via `setCustomUserClaims()`. Cheapest managed option if you are already on Google Cloud. |
| **Auth0** | **$0** on the free tier | ~1 day | Claims via Actions. Watch the free-tier ceiling. |
| **AWS Cognito** | **$0** at this scale | ~1 day | Claims via a pre-token-generation trigger. Natural fit only if you host on AWS. |
| **Microsoft Entra ID** | **$0** at this scale | ~1 day | Best if the organisation already lives in Microsoft 365. |
| **Okta** | **~$125/mo minimum** ($1,500/yr contract floor) | ~1 day | Genuinely excellent, and the enterprise-credible name — but it is the only option here with a real bill, and nothing in this app requires what you would be paying for. |

### Recommendation

**Keep Keycloak** if you are willing to run one more container: it costs
nothing, already emits the right claims, and needs zero application code
changed.

**Move to Google Cloud Identity Platform or Auth0** if you would rather not
operate an identity server. Both are free at this size and cost about a day of
work. Do this if nobody wants to be on the hook for patching Keycloak.

**Okta is not recommended here** — not because it is bad, but because you would
be paying ~$1,500/year for capabilities this app does not use. Revisit it if a
customer contractually demands it.

---

## Hosting options

The routing is the hard part. All API routing currently lives in
`frontend/vite.config.ts` — **53 path prefixes across six services, in three
rewrite classes** (34 passed through unchanged, 10 with `/api` stripped, 9
renamed). Ordering matters: `/api/frameworks/catalog` must be matched before
`/api/frameworks`, and `/api/audit` must come last or it swallows `/api/audits`
and the eight `/api/audit/*` routes. Whatever you deploy onto has to reproduce
that table faithfully.

| Option | Rough monthly cost | Moving parts | Verdict |
|---|---|---|---|
| **One virtual machine** running `docker-compose.prod.yml` | **~$28–58** | 1 host | **Simplest by a distance.** Traefik + Let's Encrypt + Postgres + Keycloak are already wired. See the caveats below. |
| **Render / Railway / Fly.io** | ~$50–120 | 7 services + DB | Easy per-service deploys; you still hand-write the 53 routing rules. |
| **Google Cloud Run** + Cloud SQL | ~$70–150 | 7 services, load balancer, SQL, VPC | Scales to zero, but the routing must become load-balancer URL-map rules where matching is priority-order, not longest-prefix. Easy to misroute silently. |
| **AWS** (App Runner/ECS + RDS) | ~$80–160 | Similar | **Not easier than GCP for this app** — the same routing problem, with more IAM. Choose AWS only if you are already there. |

### Recommendation

**Start with a single VM.** For 10–50 internal users this app does not need
autoscaling, and the repo already contains most of the deployment. It is the
cheapest, has the fewest moving parts, and the routing can be expressed in one
Traefik config you can read in a single screen. Move to Cloud Run or ECS later
if load ever justifies it.

### Caveats in `docker-compose.prod.yml`

That file is a strong starting point but is **not currently deployable**:

- There is **no frontend service** — twelve services are defined and none of
  them serves the browser app. `frontend/Dockerfile` exists but is not wired in.
- It routes **15 of the 53** API path prefixes.
- It contains **zero** path-rewrite middlewares, though 19 prefixes need one.
- `/api/assessments` is routed to the TPRM service, but the frontend expects
  the frameworks service.
- Every service sets `KEYCLOAK_URL: http://keycloak:8080/auth` — both an
  internal address (while tokens are issued with the public hostname, so
  verification would reject every token) and a `/auth` path that Keycloak
  dropped in version 17.
- Keycloak mounts certificate files that nothing in the repo creates.

---

## Work required before deploying

In dependency order. Estimates assume one developer familiar with NestJS.

| # | Work | Why it blocks deployment | Rough effort |
|---|---|---|---|
| 1 | Connect `JwtAuthGuard` in place of `DevAuthGuard` at all 60 route groups | Without it there is no authentication at all | 1 day (mechanical — both guards emit the same `UserContext`) |
| 2 | Map the login identity to a database user | The token carries the IdP's user id; every table's foreign keys use `users.id`. Nothing links them, so the first save fails | 2–4 days, including just-in-time user creation |
| 3 | Resolve `organization_id` correctly | The claim currently carries the text `default`, but the code expects a UUID. Result is empty pages **with no error** | Included in #2 |
| 4 | Decide which of the three role systems wins | Roles exist in the token, in `users.role`, and in permission groups. Only permission groups are enforced; `users.role` is never read by the permission checker | 1–2 days |
| 5 | Harden `auth/realm-export.json` | `sslRequired: none`; ROPC enabled on the public browser client; committed placeholder secrets; three plaintext demo users (`admin/admin`, `compliance_manager/compliance`, `auditor/auditor`) that must be deleted | Half a day |
| 6 | Add an audience check to token validation | `jwt.verify` pins only algorithm and issuer, so any token from the realm is accepted — including service-account tokens | 1 hour |
| 7 | Guard `POST /api/permissions/seed` | Currently has **no** authentication and takes the organisation from a request header | 1 hour |
| 8 | Build the production routing layer | 53 prefixes, 19 rewrites, order-sensitive — see above | 1–2 days |
| 9 | Fix the frontend container | `nginx.conf` hardcodes `listen 3000`; `frontend/Dockerfile` passes no `VITE_*` build arguments, so a production image bakes in `localhost:8080` as the login server | Half a day |

**Realistic total: about two to three weeks** before a first genuine
deployment, most of it in items 2–4 and 8.

---

## How the first administrator gets created

Worth understanding early, because it is not automatic.

**Creating a user in the app does not create a login.** Every user and
permission write goes to PostgreSQL only. `POST /api/users` even requires you
to already know the person's IdP user id. The one class that could create a
login in Keycloak, `KeycloakAdminService`, is imported nowhere. There is no
invite flow, no self-registration (`registrationAllowed: false`), and no
first-run setup screen.

So the sequence is:

1. **Create administrator #1 by hand** — once in the IdP (a user with the
   `admin` role and an `organization_id` attribute), and once in PostgreSQL
   (a matching `users` row). About an hour. `database/dev-bootstrap.sql` is
   the template.
2. **Build just-in-time provisioning** (item 2 above) so that everyone
   afterwards gets their database row created automatically on first login.
3. **After that**, administrators can manage people from
   **Settings → Users** and **Settings → Permissions** — but only their roles
   and permissions. Creating and disabling the actual *logins* stays in the
   IdP's console unless someone wires up `KeycloakAdminService`.

---

## What is already working

For balance — the foundations here are sound:

- `JwtAuthGuard` does genuine JWKS retrieval, RS256 verification and issuer
  pinning. It needs connecting, not writing.
- The Keycloak realm already defines the four roles the code expects and
  already emits both required claims.
- The browser app already implements the full modern login flow (OIDC with
  PKCE).
- Both guards produce the same `UserContext`, so the swap in item 1 is a
  substitution rather than a rewrite.
- The local demo works end to end: `./scripts/start-demo.sh`.
