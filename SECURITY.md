# Security Guidelines for GigaChad GRC

## Credential Management

### Default Credentials (MUST BE CHANGED)

The following default credentials are included for local development **ONLY**. These MUST be changed before deploying to production:

1. **PostgreSQL Database**
   - Username: `grc`
   - Password: `grc_secret` ← CHANGE THIS

2. **MinIO Object Storage**
   - Access Key: `minioadmin`
   - Secret Key: `minioadminpassword` ← CHANGE THIS

There is no identity-provider password to rotate: sign-in is delegated to
Firebase Authentication (Google sign-in), so the platform never stores or
verifies a user password. See
[Authentication & Authorization](#authentication--authorization).

### Production Deployment Checklist

Before deploying to production:

- [ ] Change all default passwords in `.env` file (`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`)
- [ ] Enable TLS/SSL for all services
- [ ] Set `NODE_ENV=production` and confirm `AUTH_MODE` is **unset** - `AUTH_MODE=demo` bypasses token verification and the guard refuses to start when `NODE_ENV=production`
- [ ] Set `FIREBASE_PROJECT_ID` and restrict `ALLOWED_EMAIL_DOMAINS` to the domains that may sign in
- [ ] Decide on `AUTH_AUTO_PROVISION` (leave `false` to require administrator-provisioned users)
- [ ] Enforce 2-Step Verification on the Google Workspace accounts that can sign in
- [ ] Restrict the Firebase Authentication authorized domains to your production host
- [ ] Use proper secrets management (e.g., HashiCorp Vault, AWS Secrets Manager)
- [ ] Review and harden Docker images
- [ ] Configure proper backup strategies for PostgreSQL and MinIO (`./deploy/backup.sh`)
- [ ] Set up monitoring and alerting
- [ ] Review and configure CORS policies (`CORS_ORIGINS`)
- [ ] Enable audit logging for all services
- [ ] Configure proper firewall rules
- [ ] Use environment-specific `.env` files (never commit to git)
- [ ] Run `./deploy/preflight-check.sh` and resolve every failure

## Data Scrubbing

To completely wipe all data and reset the platform:

```bash
# Stop all services and remove all data
bash scripts/data-scrub.sh

# Or, for the local demo stack:
./scripts/stop-demo.sh --clean

# Or manually:
docker-compose down
docker volume rm gigachad-grc_postgres_data
docker volume rm gigachad-grc_minio_data

# Start fresh
docker-compose up -d
```

## API Keys and Integration Credentials

### FieldGuide Integration
If using FieldGuide integration, store API keys as environment variables:
```
FIELDGUIDE_API_KEY=your-api-key-here
FIELDGUIDE_WEBHOOK_SECRET=your-webhook-secret-here
```

### Other Integrations
Store all third-party API credentials in environment variables or secrets manager, never in code.

## Database Security

1. **Connection Security**
   - Use SSL/TLS for database connections in production
   - Restrict database access to internal network only
   - Use strong, unique passwords (minimum 32 characters)

2. **Access Control**
   - Each service connects with minimal required permissions
   - Separate admin account for migrations
   - Regular password rotation

3. **Backup & Recovery**
   - Automated daily backups
   - Encrypted backup storage
   - Tested recovery procedures
   - Point-in-time recovery capability

## Authentication & Authorization

### Identity: Firebase Authentication (Google sign-in only)

There is no self-hosted identity provider and no application-managed
password. `FirebaseAuthGuard`
(`services/shared/src/auth/firebase-auth.guard.ts`) is the only
authentication guard in the system and runs on every protected route.

1. **What the token proves**
   - A Firebase ID token proves exactly one thing: which Google account is
     calling. It is verified against Firebase's JWKS, and the guard rejects
     the request unless the token's audience/issuer match
     `FIREBASE_PROJECT_ID`, `email_verified` is `true`, the sign-in provider
     is `google.com`, and `auth_time` is not in the future.
   - Firebase custom claims are deliberately **not** used for authorization:
     they only reach the client when the ID token is refreshed (up to an hour
     later), so a revoked admin would keep their old role until then.

2. **Domain allowlist**
   - A Firebase ID token carries no Google `hd` (hosted domain) claim, so
     `ALLOWED_EMAIL_DOMAINS` is the only thing restricting which Google
     accounts may authenticate. Set it; an empty value is not a safe default.
   - A matching row in the `users` table is also required unless
     `AUTH_AUTO_PROVISION=true` (in which case new users are attached to
     `AUTH_DEFAULT_ORG_ID`).

3. **Session management**
   - Firebase ID tokens are short-lived (one hour) and refreshed by the
     client SDK; the platform stores no server-side session.
   - Because role, permissions, organization and account status are read from
     PostgreSQL per request (with a 30-second identity cache), disabling or
     re-roling a user takes effect within seconds rather than at token
     expiry.
   - Multi-factor authentication, password policy and account lockout are
     properties of the Google account and are enforced in Google Workspace,
     not in this platform.

4. **The one bypass**
   - `AUTH_MODE=demo` (backend) and `VITE_AUTH_MODE=demo` (frontend, dev
     builds only) skip token verification and load a fixed demo identity from
     the database. The guard throws on startup when combined with
     `NODE_ENV=production`. Never set it on a deployed environment.

### Authorization: resolved from PostgreSQL

Every authorization decision is made from database state. An effective
permission carries its `source`: `group` (a permission group the user
belongs to), `override` (a per-user grant or denial), or `role` (the default
template for `users.role` when the user has neither).

### Role-Based Access Control (RBAC)

`users.role` (the `UserRole` enum in `services/shared/prisma/schema.prisma`)
has four values, each mapping to a default permission template that groups
and per-user overrides can then extend or restrict:

1. **admin**
   - Full system access
   - User, group and permission management
   - Configuration changes

2. **compliance_manager**
   - Manage controls, evidence, frameworks and risks
   - Create and approve policies
   - View audit logs

3. **auditor**
   - Read-only access to controls and evidence
   - View audit logs and audit findings

4. **viewer**
   - Read-only access to dashboards
   - View controls (no edit)
   - No access to audit logs or sensitive data

**External auditors** are not `users` rows and have no Google sign-in to the
application: they are separate, time-limited audit-portal accounts
(`audit_portal_users`, gated by an engagement's `audit_portal_enabled`,
`portal_access_code` and `portal_expires_at`) scoped to the audit requests
they were invited to.

## Network Security

### Internal Communication
All services communicate over the internal `grc-network` Docker network and
publish no host ports. The only container on the public `grc-dmz` network is
Traefik, which terminates TLS and forwards to the nginx `gateway` container;
`gateway/nginx.conf` is the single public entrypoint and owns all `/api`
path routing.

### Edge (Traefik + nginx gateway)
- TLS termination and Let's Encrypt certificate management (Traefik)
- HTTP-to-HTTPS redirect on the `web` entrypoint (Traefik)
- Rate limiting on the gateway router (`gateway-ratelimit`: 200 average, 100 burst)
- Request body size limit (`client_max_body_size 50m`) and upstream timeouts in `gateway/nginx.conf`
- Security headers on the controls service via `helmet`
  (`services/controls/src/main.ts`); the other five services do not register
  it yet, so header hardening for their responses has to come from the edge
- CORS restricted to `CORS_ORIGINS`

### Firewall Rules
```
# Only allow necessary ports
22   - SSH (admin only)
80   - HTTP (redirect to HTTPS)
443  - HTTPS (application)
```
Nothing else needs to be reachable from outside the host:
docker-compose.prod.yml publishes only Traefik's 80 and 443. The service
ports (frontend 3000, controls 3001, frameworks 3002, policies 3004,
tprm 3005, trust 3006, audit 3007), PostgreSQL and MinIO stay on the
internal network.

## Data Protection

### Personal Data Handling
- Identity (Google account, email, display name) is held by Firebase
  Authentication; the application stores the Firebase subject as
  `users.external_id` alongside the user's email, name, role and
  organization in PostgreSQL
- No passwords are stored or verified anywhere in the platform - Google
  performs authentication
- Audit logs contain user activities (GDPR/privacy compliance)

### Evidence Storage
- Files encrypted at rest (MinIO encryption)
- Access control per document
- Audit trail for all file access
- Retention policies enforced

### Data Retention
- Audit logs: 7 years
- Evidence: Per policy requirements
- User data: 30 days after account deletion
- Risk assessments: 3 years

## Incident Response

### Security Incident Procedures
1. Immediately disable affected accounts
2. Rotate all credentials
3. Review audit logs for impact assessment
4. Notify affected parties if required
5. Document incident in system

### Contact
For security issues, contact: security@your-company.com

## Compliance

This platform helps maintain compliance with:
- SOC 2 Type II
- ISO 27001:2022
- GDPR (data protection)
- HIPAA (healthcare data)
- PCI DSS (payment data)

## Regular Security Tasks

### Daily
- Monitor error logs
- Check failed login attempts

### Weekly
- Review new user accounts
- Check access permissions
- Review audit logs

### Monthly
- Update dependencies
- Review and rotate API keys
- Security scan of containers
- Penetration testing (external)

### Quarterly
- Full security audit
- Password policy review
- Access control review
- Disaster recovery test

## Reporting Security Issues

To report a security vulnerability:
1. Do NOT create a public GitHub issue
2. Email security@your-company.com
3. Include detailed description and reproduction steps
4. We will respond within 48 hours

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [NestJS Security](https://docs.nestjs.com/security/helmet)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)
