# GigaChad GRC - Production Deployment Checklist

Use this checklist to ensure a successful production deployment of GigaChad GRC.

## Pre-Deployment Checklist

### Infrastructure Setup

- [ ] **Server provisioned**: 2 vCPU / 4 GB RAM / 40 GB SSD minimum, 4 vCPU / 8 GB / 80 GB comfortable. The peak is the first image build (a Vite build of the frontend needs 1.5-2.5 GB), not steady-state running
- [ ] **Operating System**: Ubuntu 22.04 LTS or later installed
- [ ] **Docker** (v24.0+) installed and running
- [ ] **Docker Compose** (v2.20+) installed
- [ ] **Git** installed
- [ ] **Server has static IP address**
- [ ] **Firewall configured** (ports 80, 443, 22)
- [ ] **SSH access** configured with key-based authentication
- [ ] **Root/sudo access** available

### Domain & DNS

- [ ] **Domain purchased** and registered
- [ ] **DNS A records** configured:
  - [ ] `grc.example.com` → Server IP (the application; `APP_DOMAIN`)
  - [ ] `storage.grc.example.com` → Server IP (MinIO S3 API)
  - No `auth.` record: sign-in is Firebase Authentication, hosted by Google
  - No `console.storage.` record: the MinIO console is not routed
- [ ] **DNS propagation verified** (nslookup/dig)
- [ ] **TTL lowered** (24 hours before deployment)

### Security Preparation

- [ ] **Strong passwords generated** for all services
- [ ] **Encryption keys generated**
- [ ] **SSL strategy decided** (Let's Encrypt or custom certificates)
- [ ] **SMTP credentials** obtained (if using email notifications)
- [ ] **Secrets manager** configured (optional but recommended)
- [ ] **Backup storage** location identified
- [ ] **Security scanning tools** installed (optional)

### Team Preparation

- [ ] **Deployment team identified**
- [ ] **Communication channels** established
- [ ] **Rollback plan** documented
- [ ] **Emergency contacts** list created
- [ ] **Deployment window scheduled**
- [ ] **Stakeholders notified**

## Deployment Checklist

### Phase 1: Environment Setup (30 minutes)

- [ ] **Repository cloned** to `/opt/gigachad-grc`
- [ ] **Environment file created** from `deploy/env.example` (`cp deploy/env.example .env.prod`)
- [ ] **All CHANGE_ME values updated** in `.env.prod`
- [ ] **Domain names updated** in `.env.prod`
- [ ] **ACME email configured** for Let's Encrypt
- [ ] **File permissions set** (`chmod 600 .env.prod`)
- [ ] **.env.prod added to .gitignore**
- [ ] **Configuration resolves** (`docker compose -f docker-compose.prod.yml --env-file .env.prod config`)
- [ ] **Production validation passed** (`npm run validate:production`)

### Phase 2: Security Configuration (15 minutes)

- [ ] **PostgreSQL password** set (32+ characters)
- [ ] **`NODE_ENV=production`** set and **`AUTH_MODE` left unset** (the auth guard refuses to start with `AUTH_MODE=demo` under production)
- [ ] **MinIO credentials** set (20+ characters)
- [ ] **ENCRYPTION_KEY** generated (`openssl rand -hex 32`, at least 32 characters) **and stored off the server** - it cannot be recovered from a backup
- [ ] **All secrets documented** in secrets manager
- [ ] **Secrets backup** stored securely offline

### Phase 3: Initial Deployment (20 minutes)

- [ ] **Docker images pulled** successfully
- [ ] **Services built** without errors
- [ ] **All containers started** (`docker compose up -d`)
- [ ] **All services running** (`docker compose ps`)
- [ ] **No error logs** in initial startup
- [ ] **Health checks passing** for all services
- [ ] **Database initialized** successfully

### Phase 4: SSL/TLS Configuration (10 minutes)

- [ ] **Let's Encrypt certificate** generated automatically OR
- [ ] **Custom SSL certificates** installed
- [ ] **HTTPS accessible** on all domains
- [ ] **HTTP redirects to HTTPS** working
- [ ] **Certificate validity verified** (3 months for Let's Encrypt)
- [ ] **Certificate auto-renewal** configured
- [ ] **SSL Labs test** run (Grade A or higher)

### Phase 5: Service Configuration (30 minutes)

#### Authentication (Firebase)

- [ ] **Firebase project created**; `FIREBASE_PROJECT_ID` set in `.env.prod`
- [ ] **Google sign-in provider enabled** (no other provider is accepted)
- [ ] **Authorized domains** include the production host
- [ ] **Web app registered**; `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` set **before** the frontend image is built
- [ ] **`VITE_FIREBASE_PROJECT_ID` equals `FIREBASE_PROJECT_ID`**
- [ ] **`ALLOWED_EMAIL_DOMAINS`** restricted to the permitted email domains
- [ ] **`AUTH_AUTO_PROVISION`** decided (`false` means an admin must provision each user)
- [ ] **First administrator `users` row created** (nothing creates it for you)
- [ ] **2-Step Verification enforced** on the Google accounts that can sign in
- [ ] **Sign-in flow tested end to end** with a real Google account

#### MinIO

- [ ] **Console left disabled** (`MINIO_BROWSER=off`, no Traefik router) - reach it via SSH tunnel to container port 9001 only when needed
- [ ] **Bucket created**, named by `MINIO_BUCKET` / `S3_BUCKET` (default `grc-storage`)
- [ ] **Bucket kept private** (the application issues presigned URLs)
- [ ] **S3 API reachable** at `https://storage.<APP_DOMAIN>`
- [ ] **File upload tested**
- [ ] **File download tested**

#### PostgreSQL

- [ ] **Database accessible** from services
- [ ] **Schema applied** with `prisma db push` ([runbook 7.2](../docs/DEPLOYMENT-RUNBOOK.md#72-apply-the-schema)). Do not use `prisma migrate deploy` or `deploy/db-migrate.sh`: there is no baseline migration to apply
- [ ] **Database seeding completed** (if applicable)
- [ ] **Connection pool configured**
- [ ] **Query performance acceptable**
- [ ] **Database backup tested**

#### Application Services

- [ ] **All services responding** to health checks
- [ ] **Inter-service communication** working
- [ ] **API endpoints accessible**
- [ ] **Authentication working** end-to-end
- [ ] **File uploads working**

### Phase 6: Backup Configuration (15 minutes)

- [ ] **Backup directory created** (`/backups/gigachad-grc`)
- [ ] **Backup script tested** (`./deploy/backup.sh`)
- [ ] **Backup completed** successfully
- [ ] **Backup size verified** (reasonable)
- [ ] **Cron job configured** for automatic backups
- [ ] **Backup retention configured** (30 days)
- [ ] **Remote backup configured** (if applicable)
- [ ] **Restore script tested** (`./deploy/restore.sh`)
- [ ] **Disaster recovery procedure documented**

### Phase 7: Monitoring & Logging (20 minutes)

- [ ] **Log aggregation** configured (optional)
- [ ] **Metrics collection** setup (optional)
- [ ] **Health check monitoring** enabled
- [ ] **Alerting configured** for critical services
- [ ] **Log rotation** verified
- [ ] **Disk space monitoring** setup
- [ ] **Performance metrics** baseline established
- [ ] **Error tracking**: none is wired into the services - error visibility comes from container logs and the audit log

### Phase 8: Testing & Validation (30 minutes)

#### Functional Testing

- [ ] **Google sign-in** working end to end (there is no self-registration and no password reset - Google owns the credential)
- [ ] **Access denial verified**: a Google account outside `ALLOWED_EMAIL_DOMAINS`, and one with no `users` row, are both rejected
- [ ] **2-Step Verification** enforced on the Google accounts (in Google Workspace, not here)
- [ ] **Role/permission enforcement** verified: a `viewer` cannot perform an `admin` action
- [ ] **API endpoints** responding correctly
- [ ] **File uploads/downloads** working
- [ ] **Search functionality** working
- [ ] **Notifications** working (if configured)

#### Performance Testing

- [ ] **Page load times** acceptable (<3 seconds)
- [ ] **API response times** acceptable (<500ms)
- [ ] **Database query performance** acceptable
- [ ] **Concurrent users** tested
- [ ] **Resource usage** within limits

#### Security Testing

- [ ] **HTTPS enforced** on all endpoints
- [ ] **Security headers** present
- [ ] **Rate limiting** functional
- [ ] **CORS** configured correctly
- [ ] **Authentication required** for protected endpoints
- [ ] **SQL injection** protection verified
- [ ] **XSS protection** verified
- [ ] **CSRF protection** verified

### Phase 9: Advanced Features Configuration (20 minutes)

#### Health Checks & Monitoring

- [ ] **Health endpoints accessible** on all services:
  - [ ] `/health` - Full health check
  - [ ] `/health/live` - Liveness probe
  - [ ] `/health/ready` - Readiness probe
- [ ] **Container healthchecks** reporting healthy (`docker compose -f docker-compose.prod.yml --env-file .env.prod ps`)
- [ ] **External health monitoring** setup (Uptime Robot, Pingdom, etc.)

#### Rate Limiting

- [ ] **Application rate limiting** active on the controls service (`ThrottlerModule`, tiered: 5/second, 30/10 seconds, 100/minute). The other five services rely on the edge limit alone
- [ ] **Edge rate limiting** active on the gateway router (`gateway-ratelimit`: 200 average, 100 burst)
- [ ] Understood that the tier values are hard-coded: `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` are read by no service, and no route is excluded from throttling

#### Caching

- [ ] **In-process cache active** (`services/shared/src/cache`; there is no external cache server in this deployment)
- [ ] **Cache TTL** appropriate (default 300 seconds)
- [ ] **Cache invalidation tested** on data updates
- [ ] **Cache size limit** configured (default `maxSize: 1000` entries per service instance)

#### Security Enhancements

- [ ] **Response compression enabled** (gzip)
- [ ] **Helmet security headers** active on the controls service (`services/controls/src/main.ts`)
- [ ] **CORS properly configured** for production domain
- [ ] **Global exception filter** providing safe error responses
- [ ] **No stack traces** exposed in production errors

#### Bulk Operations

- [ ] **Bulk select** working on listing pages
- [ ] **Bulk delete** working with confirmation
- [ ] **Bulk status update** working
- [ ] **Toast notifications** showing correct counts

#### Advanced Filters

- [ ] **Filter builder** working on relevant pages
- [ ] **Filter presets** can be saved and loaded
- [ ] **Date range filtering** working

#### Export Functionality

- [ ] **CSV export** working
- [ ] **Excel export** working
- [ ] **PDF export** (via print) working

#### Compliance Calendar

- [ ] **Policy review events** displaying
- [ ] **Audit deadlines** displaying
- [ ] **Control review events** displaying
- [ ] **Contract expiration events** displaying

### Phase 10: Documentation (15 minutes)

- [ ] **Deployment date** documented
- [ ] **Configuration details** documented
- [ ] **Credentials location** documented
- [ ] **Emergency procedures** documented
- [ ] **Rollback procedures** documented
- [ ] **Team access** documented
- [ ] **Support contacts** documented
- [ ] **SLA commitments** documented

## Post-Deployment Checklist

### Immediate (Day 1)

- [ ] **Monitor logs** for errors
- [ ] **Check service health** every hour
- [ ] **Verify backup** ran successfully
- [ ] **Test user access** from different locations
- [ ] **Monitor resource usage** (CPU, RAM, disk)
- [ ] **Document any issues** encountered
- [ ] **Communicate** deployment success to stakeholders

### Week 1

- [ ] **Daily backup verification**
- [ ] **Daily log review**
- [ ] **Performance monitoring**
- [ ] **User feedback collection**
- [ ] **Minor bug fixes** deployed
- [ ] **Documentation updates**
- [ ] **Team training** completed

### Month 1

- [ ] **Weekly backup restoration test**
- [ ] **Security scan** performed
- [ ] **Performance optimization** implemented
- [ ] **Monitoring alerts** tuned
- [ ] **Disaster recovery drill** executed
- [ ] **Quarterly review scheduled**
- [ ] **Compliance audit** (if applicable)

## Rollback Checklist

The procedure is [Deployment Runbook §10](../docs/DEPLOYMENT-RUNBOOK.md#10-rollback),
which distinguishes a code-only rollback from one that must also restore the
database. Working through it:

- [ ] **Fresh backup taken** before touching anything - a restore discards current data
- [ ] **Stack stopped** (`docker compose -f docker-compose.prod.yml --env-file .env.prod down`)
- [ ] **Restored from the last known good archive** (`./deploy/restore.sh <archive>`), if the schema changed
- [ ] **Verify restoration** successful
- [ ] **Test functionality** before announcing rollback
- [ ] **Document rollback reason**
- [ ] **Communicate** to stakeholders
- [ ] **Schedule post-mortem** meeting

## Maintenance Schedule

### Daily

- [ ] Monitor service health
- [ ] Review error logs
- [ ] Verify backups completed

### Weekly

- [ ] Review performance metrics
- [ ] Test backup restoration
- [ ] Update security patches
- [ ] Review access logs

### Monthly

- [ ] Security scan
- [ ] Disaster recovery drill
- [ ] Database maintenance
- [ ] Certificate expiry check
- [ ] Resource capacity planning

### Quarterly

- [ ] Comprehensive security audit
- [ ] Performance optimization
- [ ] Documentation review
- [ ] Team training refresh
- [ ] Compliance review

## Emergency Contacts

| Role | Name | Contact | Availability |
|------|------|---------|--------------|
| Deployment Lead | | | |
| DevOps Engineer | | | |
| Database Admin | | | |
| Security Officer | | | |
| On-Call Support | | | 24/7 |

## Sign-Off

### Pre-Deployment Review

- [ ] Technical Lead: __________________ Date: __________
- [ ] Security Officer: ________________ Date: __________
- [ ] Operations Manager: ______________ Date: __________

### Post-Deployment Verification

- [ ] Technical Lead: __________________ Date: __________
- [ ] Security Officer: ________________ Date: __________
- [ ] Operations Manager: ______________ Date: __________

### Production Approval

- [ ] Product Owner: ___________________ Date: __________
- [ ] Executive Sponsor: _______________ Date: __________

---

**Deployment Date**: __________________
**Deployment Version**: __________________
**Deployed By**: __________________

---

**Notes:**

Use this space to document any deployment-specific notes, issues encountered, or deviations from the standard process:

```
[Add your notes here]
```

---

**For assistance, refer to:**
- [docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md) - Authoritative step-by-step runbook
- [deploy/README.md](./README.md) - What is in `deploy/`, plus Firebase, MinIO, backup and monitoring operations
- [deploy/QUICKSTART.md](./QUICKSTART.md) - Condensed command reference
- [docs/PRODUCTION_DEPLOYMENT.md](../docs/PRODUCTION_DEPLOYMENT.md) - Architecture and troubleshooting reference
