# Hosting Requirements

What you actually need to run GigaChad GRC for real, what it costs, and what is
still outstanding. Written for someone who is not a cloud specialist.

Everything here was checked against this repository. Prices were observed on
**2026-09-09** and link to the vendor's own page — re-check before committing.

Ready to deploy? The step-by-step procedure is the
**[Deployment Runbook](./DEPLOYMENT-RUNBOOK.md)**. This document is the "what
and how much" that comes before it.

---

## Jargon, once

| Term | Meaning |
|---|---|
| **IdP** (identity provider) | The service that owns usernames and passwords and hands out login tokens. Your app never sees the password. This app uses Firebase Authentication, which is Google's hosted IdP. |
| **SSO** (single sign-on) | Logging in once at the IdP instead of the app keeping its own passwords. Here it means: sign in with the Google account you already have. |
| **ID token** | The signed digital ticket the IdP gives your browser after login. The browser attaches it to every API call as `Authorization: Bearer <token>`. |
| **JWKS** | A public web address where the IdP publishes the keys used to sign those tickets, so the API can verify them. Read-only; nothing secret is shared. |
| **Claim** | One field inside the token. This app reads only identity claims (`sub`, `email`, `email_verified`, sign-in provider). **Roles and permissions are never taken from the token** — they are read from PostgreSQL on every request. |
| **MAU** | Monthly active user — someone who logged in at least once that month. Most IdPs bill this way. |
| **Hosted domain (`hd`)** | A Google claim that names the Workspace domain an account belongs to. Firebase ID tokens **do not carry it**, which is why the email-suffix allowlist plus a database row are the real gate. |

---

## Read this first: what deployment now looks like

Authentication is implemented and wired. Every one of the 99 guarded route
groups across the six services uses `FirebaseAuthGuard`
(`services/shared/src/auth/firebase-auth.guard.ts`), which verifies a
Google-issued Firebase ID token and then resolves the caller's role,
organization and status from the `users` table.

The only bypass in the system is `AUTH_MODE=demo`, used by
`./scripts/start-demo.sh`. It refuses to initialise when
`NODE_ENV=production`, so it cannot follow you into a deployment.

What that means in practice: a first deployment is now a configuration job —
a Firebase project, a server, an environment file, and one hand-written
administrator row — not a development project. See
[Still outstanding](#still-outstanding) for the short list of things that are
genuinely unfinished.

---

## Required accounts and services

For a small internal deployment (10–50 people).

| Thing | Required? | Notes |
|---|---|---|
| **Google Cloud / Firebase account** | **Required** | Free. Hosts the identity provider. Your existing Google Workspace accounts are the user directory — there is no user import step. |
| **Domain name** | **Required** | One hostname for the app. No second hostname is needed for auth: sign-in happens on Google's own domain. |
| **TLS certificate** | **Required** | Free via Let's Encrypt. `docker-compose.prod.yml` already runs Traefik configured to obtain them automatically. |
| **PostgreSQL 16** | **Required** | The only datastore, and the source of truth for roles, permissions and organizations. Managed (Cloud SQL / RDS) or the container in the compose file. |
| **Object storage (S3 etc.)** | **Optional** | Only for evidence file uploads. `STORAGE_TYPE=local` writes to disk instead and needs a persistent volume. Start local or with the bundled MinIO; add S3 when you need durability or multiple app instances. |
| **Cache / message broker** | **Not needed** | Removed from the codebase. It was never wired up: `EVENT_BUS` was injected nowhere, `publish()` had no call sites, and the queue was imported by no module. Caching is in-process and rate limiting is in-memory. Do not provision one. |
| **SMTP / email** | **Optional** | `deploy/env.example` ships `EMAIL_PROVIDER=console`, which logs messages instead of sending them. The code's own fallback is `smtp`, which needs `SMTP_HOST` and friends. Either way, nothing leaves the building until you configure a provider. |
| **OpenAI / Anthropic API key** | **Optional** | Only the AI assist features need one. Everything else works without. |

---

## Identity provider

**Firebase Authentication with the Google provider is implemented**, not
proposed. `FirebaseAuthGuard` fetches Google's signing keys from
`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`,
requires RS256, and pins both the issuer
(`https://securetoken.google.com/<FIREBASE_PROJECT_ID>`) and the audience
(`FIREBASE_PROJECT_ID`). It also rejects unverified email addresses and any
sign-in provider other than `google.com`.

Two environment variables carry the whole configuration: `FIREBASE_PROJECT_ID`
and `ALLOWED_EMAIL_DOMAINS`. The browser needs three build-time values
(`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`); the Web API key is a **public** client
identifier, not a secret.

### Cost, and what switching would cost

| Provider | Cost, 10–200 internal users | Effort to adopt | Notes |
|---|---|---|---|
| **Firebase Authentication** (implemented) | **$0** — Google sign-in is free at this scale | **None. Already done** | You operate nothing. Upgrading to Identity Platform is only needed above 50,000 MAU or for enterprise features. |
| **Google Cloud Identity Platform** | **$0** (free to 50,000 MAU) | Hours | The same token format and the same JWKS endpoint. Effectively a licence upgrade of the above, not a migration. |
| **Auth0** | **$0** on the free tier | ~1 day | Different issuer, audience and JWKS URL, so the guard needs those three values parameterised. Watch the free-tier ceiling. |
| **AWS Cognito** | **$0** at this scale | ~1 day | Same shape of change. Natural fit only if you host on AWS. |
| **Microsoft Entra ID** | **$0** at this scale | ~1 day | Best if the organisation lives in Microsoft 365 rather than Google Workspace. |
| **Okta** | **~$125/mo minimum** ($1,500/yr contract floor) | ~1 day | Genuinely excellent, and the enterprise-credible name — but it is the only option here with a real bill, and nothing in this app requires what you would be paying for. |

### Recommendation

**Stay on Firebase Authentication.** It costs nothing, it is already
implemented and verified in code, and the company's existing Google accounts
are the directory. Nobody has to operate an identity server, patch one, or
back one up.

**Switch only for a directory reason, not a technical one** — for example if
the organisation moves to Microsoft 365. The work is confined to the three
provider constants in `firebase-auth.guard.ts` plus the frontend sign-in call;
everything downstream reads identity from PostgreSQL and would not change.

**Okta is still not recommended here** — not because it is bad, but because
you would be paying ~$1,500/year for capabilities this app does not use.
Revisit it if a customer contractually demands it.

---

## Hosting options

Routing used to be the hard part; it is now solved in one file.
`gateway/nginx.conf` reproduces all **53 API path prefixes across six
services in three rewrite classes** (34 passed through unchanged, 10 with
`/api` stripped, 9 renamed), and nginx resolves overlapping prefixes by
longest-match rather than by declaration order. Whatever you deploy onto has
to reproduce that table faithfully — on a single VM you get it for free.

| Option | Rough monthly cost | Moving parts | Verdict |
|---|---|---|---|
| **One virtual machine** running `docker-compose.prod.yml` | **~$28–58** | 1 host | **Simplest by a distance.** Traefik + Let's Encrypt + Postgres + MinIO + the nginx gateway are all wired already. |
| **Render / Railway / Fly.io** | ~$50–120 | 8 services + DB | Easy per-service deploys, but each platform's own router replaces the gateway, so you re-express the 53 rules in its language. |
| **Google Cloud Run** + Cloud SQL | ~$70–150 | 8 services, load balancer, SQL, VPC | Scales to zero, but the routing must become load-balancer URL-map rules where matching is priority-order, not longest-prefix. Easy to misroute silently. |
| **AWS** (App Runner/ECS + RDS) | ~$80–160 | Similar | **Not easier than GCP for this app** — the same routing problem, with more IAM. Choose AWS only if you are already there. |

### Recommendation

**Start with a single VM.** For 10–50 internal users this app does not need
autoscaling, the repo already contains the whole deployment, and the routing
is a file you can read in one sitting. Move to Cloud Run or ECS later if load
ever justifies it — and note that more than one replica of a service needs the
scheduler and throttler work listed below.

Concrete sizing, firewall rules and DNS are in the
[Deployment Runbook](./DEPLOYMENT-RUNBOOK.md#4-provision-the-server).

---

## Already done

These were all blockers in earlier revisions of this document. Each has been
re-verified against the repository.

| Was | Now |
|---|---|
| No authentication anywhere; the real guard was wired to zero routes | `FirebaseAuthGuard` is on all **99** `@UseGuards` sites across the six services. The development guards (`dev-auth.guard.ts`) are deleted |
| Nothing linked the login identity to a `users` row | `users.external_id` (unique) holds the token's `sub`. The guard looks up by `sub`, falls back to a match on the verified email and claims that row, and can optionally auto-provision (`AUTH_AUTO_PROVISION`) |
| `organization_id` came from a token claim and was the literal text `default` | The organization is read from the `users` row. No authorization value is ever read from a claim |
| Three competing role systems, only one enforced | One resolution order: permission-group grants, then per-user overrides, then a fallback derived from `users.role`. `EffectivePermissionDto.source` is `'group' \| 'override' \| 'role'`. The old `NODE_ENV !== 'production'` bypass in `permission.guard.ts` is deleted, so authorization always resolves from the database |
| A committed identity-server configuration with TLS not required, legacy password-grant login enabled and three plaintext demo users | Deleted with the rest of the self-hosted identity server. Sign-in is Google's, and the app stores no passwords |
| Token validation pinned only algorithm and issuer, so any token the old identity server issued was accepted — including service-account tokens | `jwt.verify` now pins algorithm, issuer **and** audience (`FIREBASE_PROJECT_ID`), and the guard additionally requires `email_verified` and the `google.com` sign-in provider |
| `POST /api/permissions/seed` had no authentication and took the organisation from a request header | It sits behind the controller's auth guard like every other route and takes the organization from the verified session |
| No production routing layer: 15 of 53 prefixes routed, zero rewrites | `gateway/nginx.conf` — 53 prefixes, three rewrite classes, longest-prefix matching — is the single public entrypoint, and `docker-compose.prod.yml` has both a `frontend` and a `gateway` service |
| The frontend container hardcoded `listen 3000` and baked no Firebase config | `frontend/nginx.conf.template` templates `listen ${PORT}`, and `frontend/Dockerfile` takes the three `VITE_FIREBASE_*` values as build arguments, which `docker-compose.prod.yml` passes |
| Only the controls service had a health endpoint | All six wire the shared `HealthModule`: `/health`, `/health/live`, `/health/ready`. Controls additionally serves `GET /api/system/health` |
| `POST /api/users` required the person's Firebase UID, so nobody could be invited before their first sign-in | `externalId` is optional. Omitting it stores a `pending:<uuid>` placeholder that the guard claims by verified email on first sign-in, and **Settings → Users** has a create form. Accounts that have never signed in say so |
| The user list was always empty: the API returns `{users,…}` and six callers read `.data` | Fixed at the type, not per caller. `usersApi.list` declares the real shape. Workspace Settings → Add Member additionally threw, because its fallback yielded the response object and the next line called `.filter` on it |
| Two readiness scripts that disagreed, one of which aborted after its first check | `deploy/preflight-check.sh` is deleted; its unique host checks are folded into `scripts/validate-production.sh`. That script was itself broken — under `set -e`, `((PASSED++))` returns 1 when the counter is 0, so it exited after one of its 34 checks |
| The `$24` droplet would have been reported as a hard failure | The ported memory check compares MB against 3500/1900. A 4 GB droplet reports ~3936 MB, which integer-divided to `3` under the old whole-GB test and failed an 8 GB floor |
| `VITE_ALLOWED_EMAIL_DOMAIN` could never take effect | `ARG` in `frontend/Dockerfile` and a build arg in `docker-compose.prod.yml`, verified present in rendered `docker compose config` output |
| `ENCRYPTION_KEY`, `CORS_ORIGINS` and the whole email configuration reached no container | Forwarded: the first two to all six services, the email block to `controls`, which is the only service that sends mail |
| `deploy/env.example` advertised `BACKUP_S3_*` variables that no code reads | Corrected to the `DR_REMOTE_BACKUP_*` names `deploy/backup.sh` actually reads. An operator following the template would have configured nothing |
| Email misconfiguration failed silently | Every incomplete provider config fell back to console logging with only a `logger.warn`, and an unrecognised `EMAIL_PROVIDER` value silently became `smtp`. The service now **refuses to start** under `NODE_ENV=production` on any incomplete or unrecognised provider configuration, and `validate:production` catches the same cases before deployment |

---

## Still outstanding

Two items, neither of which blocks a first single-VM deployment.

| # | Work | Why it matters | Rough effort |
|---|---|---|---|
| 1 | Verify the sending domain in Resend | The provider is chosen and wired: `resend` is a first-class `EMAIL_PROVIDER` and `deploy/env.example` ships it. What remains is configuration in the existing Resend account — add the sending domain and publish the DNS records Resend gives you, create an API key scoped to it, then set `RESEND_API_KEY` and an `EMAIL_FROM` on that verified domain. Until the domain is verified Resend sends nothing, and a From address on any other domain is rejected on every send. `npm run validate:production` fails without the key or `EMAIL_FROM`, and the controls service refuses to start under `NODE_ENV=production` rather than logging emails instead of sending them | Minutes, plus DNS propagation |
| 2 | Make more than one replica safe | Blocks horizontal scaling, nothing else, and the single-VM deployment runs one of each. `ThrottlerModule` (`services/controls/src/app.module.ts`) has no shared storage, so the effective rate limit would multiply by replica count, and the other five services register no throttler at all. Two schedulers in controls (`collectors.scheduler.ts`, `scheduled-notifications.service.ts`) run from `setInterval` and would fire once per replica. The fix is a PostgreSQL advisory lock per tick, not new infrastructure. `docker-compose.prod.yml` carries a comment where a `replicas` block would go | 1 day |

Smaller things a reviewer should know about, none of them blocking:

- `POST /api/users` still requires `firstName` and `lastName` (the columns are
  `NOT NULL`), so an invitation is name-plus-email, not email alone.
- `role` is validated as a string and cast to the Prisma enum on write, so a
  hand-crafted request with a bogus role fails at the database rather than at
  validation. The UI only offers valid values.
- `services/controls/src/permissions/dto/permission.dto.ts` still exposes a raw
  `externalId` on the group-members route, so a `pending:` placeholder can leave
  the API there. Nothing renders it.
- `hasSignedIn` derives from `lastLoginAt`, which the guard writes
  fire-and-forget with `.catch(() => undefined)`. If that write fails, a real
  user keeps showing the "has not signed in" line until the next request.

**A first deployment is now hours, not weeks.**

---

## How the first administrator gets created

Worth understanding early, because it is still not automatic.

**Creating a user in the app does not create a login, and vice versa.** Logins
live in Google Workspace; roles and permissions live in PostgreSQL. There is
no invite flow, no self-registration and no first-run setup screen.

So the sequence is:

1. **Create administrator #1 by hand in PostgreSQL** — one `organizations`
   row and one `users` row with `role = 'admin'`. About ten minutes.
   `database/dev-bootstrap.sql` is the template, and the exact SQL is in the
   [runbook](./DEPLOYMENT-RUNBOOK.md#6-create-the-first-administrator).
   You can either insert a placeholder `external_id` and let the guard claim
   the row on first sign-in (it matches on the verified email address), or
   copy the person's UID from the Firebase console and insert it directly.
2. **Decide how everyone else arrives.** Either set
   `AUTH_AUTO_PROVISION=true` with `AUTH_DEFAULT_ORG_ID`, which creates a
   `viewer` row on first sign-in for anyone inside `ALLOWED_EMAIL_DOMAINS`, or
   leave it `false` and add rows deliberately.
3. **After that**, administrators manage people from **Settings → Users** and
   **Settings → Permissions** — roles, groups and overrides. Creating and
   disabling the actual *logins* stays in the Google admin console.

---

## What is already working

For balance — the foundations here are sound:

- Authentication is real: JWKS retrieval, RS256, issuer **and** audience
  pinning, verified-email and provider assertions, and a 30-second identity
  cache so the database is not hit on every request.
- Authorization always resolves from the database, in production and in
  development alike, with a role-derived fallback so a user with no group
  memberships is not silently locked out.
- The production ingress is complete: one entrypoint, all 53 routes, and a
  file that states why each overlapping prefix wins.
- Backups and restores are scripted (`deploy/backup.sh`, `deploy/restore.sh`)
  and a `backup-scheduler` container is defined in `docker-compose.prod.yml`.
- `npm run validate:production` checks the deployment's configuration,
  including that the demo bypass is not enabled.
- The local demo works end to end: `./scripts/start-demo.sh`.
