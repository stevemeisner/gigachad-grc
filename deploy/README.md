# GigaChad GRC - Production Deployment Guide

This guide provides comprehensive instructions for deploying GigaChad GRC in a production environment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Server Requirements](#server-requirements)
- [Installation](#installation)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Deployment](#deployment)
- [Configure Firebase Authentication](#configure-firebase-authentication)
- [Configure MinIO](#configure-minio)
- [Backup & Recovery](#backup--recovery)
- [Monitoring & Logging](#monitoring--logging)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)
- [Production Checklist](#production-checklist)
- [Support](#support)

## Prerequisites

### Required Software

- **Operating System**: Ubuntu 22.04 LTS or later (recommended)
- **Docker**: Version 24.0 or later
- **Docker Compose**: Version 2.20 or later
- **Git**: Version 2.30 or later
- **OpenSSL**: For generating secrets

### Server Requirements

#### Minimum Requirements

- **CPU**: 4 cores
- **RAM**: 16 GB
- **Storage**: 100 GB SSD
- **Network**: 100 Mbps

#### Recommended Requirements (Production)

- **CPU**: 8+ cores
- **RAM**: 32 GB+
- **Storage**: 500 GB SSD (NVMe preferred)
- **Network**: 1 Gbps
- **Backup Storage**: Additional 500 GB for backups

### Domain & DNS

- A registered domain name
- DNS A records configured:
  - `grc.example.com` → Server IP (the application; `APP_DOMAIN`)
  - `storage.grc.example.com` → Server IP (MinIO S3 API)

  There is no `auth.` record: sign-in is handled by Firebase Authentication,
  hosted by Google. There is no `console.storage.` record either - the MinIO
  console is not routed through Traefik (see [Configure MinIO](#configure-minio)).

### Firewall Configuration

Open the following ports:

```bash
# HTTP (will redirect to HTTPS)
sudo ufw allow 80/tcp

# HTTPS
sudo ufw allow 443/tcp

# SSH (for remote management)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

## Installation

### Step 1: Install Docker

```bash
# Update package index
sudo apt-get update

# Install dependencies
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up the stable repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to the docker group
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker compose version
```

### Step 2: Clone Repository

```bash
# Clone the repository
cd /opt
sudo git clone https://github.com/yourusername/gigachad-grc.git
sudo chown -R $USER:$USER gigachad-grc
cd gigachad-grc

# Checkout production branch or tag
git checkout v1.0.0  # or your desired version
```

### Step 3: Configure Environment

```bash
# Copy production environment template
cp deploy/env.example .env.prod

# Generate secure secrets
openssl rand -base64 64 > /tmp/jwt_secret
openssl rand -base64 64 > /tmp/session_secret
openssl rand -hex 32 > /tmp/encryption_key
openssl rand -base64 32 > /tmp/postgres_password
openssl rand -base64 20 > /tmp/minio_password

# Edit .env.prod with your actual values
nano .env.prod

# Set secure permissions
chmod 600 .env.prod

# Never commit this file!
echo ".env.prod" >> .gitignore
```

### Step 4: Update Configuration Values

Edit `.env.prod` and update the following critical values:

```bash
# Domain configuration
APP_DOMAIN=your-domain.com
ACME_EMAIL=admin@your-domain.com
MINIO_DOMAIN=storage.your-domain.com

# Database password (use generated value)
POSTGRES_PASSWORD=$(cat /tmp/postgres_password)

# MinIO credentials (use generated value)
MINIO_ROOT_PASSWORD=$(cat /tmp/minio_password)
MINIO_BROWSER=off

# JWT & Session secrets (use generated values)
JWT_SECRET=$(cat /tmp/jwt_secret)
SESSION_SECRET=$(cat /tmp/session_secret)
ENCRYPTION_KEY=$(cat /tmp/encryption_key)

# Authentication - Firebase (Google sign-in only).
# The token proves identity; role, permissions and organization are read
# from PostgreSQL on every request.
FIREBASE_PROJECT_ID=your-firebase-project
ALLOWED_EMAIL_DOMAINS=your-company.com
AUTH_AUTO_PROVISION=false
# AUTH_MODE must stay unset in production.

# Frontend Firebase config - BUILD-TIME values compiled into the bundle.
# Changing one requires rebuilding the frontend image.
# The Web API key is a public client identifier, not a secret.
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project

# SMTP configuration (if using email notifications)
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## SSL/TLS Configuration

### Automatic SSL with Let's Encrypt (Recommended)

The docker-compose configuration automatically handles SSL certificate generation using Let's Encrypt.

**Requirements:**
- Domain must be publicly accessible
- DNS A records must point to your server
- Ports 80 and 443 must be open

The certificates will be automatically:
- Generated on first startup
- Renewed automatically before expiration
- Stored in the `traefik_letsencrypt` Docker volume

### Manual SSL Certificate Installation

If you have your own SSL certificates:

1. Create a directory for certificates:

```bash
mkdir -p /opt/gigachad-grc/certs
chmod 700 /opt/gigachad-grc/certs
```

2. Copy your certificates:

```bash
# Copy certificate files
cp your-domain.crt /opt/gigachad-grc/certs/server.crt
cp your-domain.key /opt/gigachad-grc/certs/server.key

# Set permissions
chmod 600 /opt/gigachad-grc/certs/*
```

3. Update `docker-compose.prod.yml` to mount certificates:

```yaml
traefik:
  volumes:
    - ./certs:/certs:ro
```

## Deployment

### Build and Start Services

```bash
# Navigate to project directory
cd /opt/gigachad-grc

# Pull the latest images
docker compose -f docker-compose.prod.yml --env-file .env.prod pull

# Build custom service images
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# Start all services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Verify all services are running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f
```

### Initial Database Setup

```bash
# Wait for PostgreSQL to be ready (user must match POSTGRES_USER in .env.prod)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres pg_isready -U grc

# Apply the database schema
./deploy/db-migrate.sh migrate
```

**Creating the first administrator.** Nothing creates it for you: there is no
invite email, no self-registration and no first-run wizard. Signing in with
Google proves who you are, it does not grant access - until a `users` row
exists, every request is rejected. Insert the first row by hand following
[docs/DEPLOYMENT-RUNBOOK.md](../docs/DEPLOYMENT-RUNBOOK.md).

### Configure Firebase Authentication

There is no identity server to install; Firebase Authentication is a hosted
Google service.

1. In the [Firebase console](https://console.firebase.google.com), create a
   project (or reuse one) and note its **Project ID** - this is
   `FIREBASE_PROJECT_ID`.

2. **Authentication → Sign-in method**: enable the **Google** provider. No
   other provider is accepted; the guard rejects any token whose
   `sign_in_provider` is not `google.com`.

3. **Authentication → Settings → Authorized domains**: add your production
   host (`your-domain.com`). Sign-in from any other origin will fail.

4. **Project settings → General → Your apps**: register a **Web** app and
   copy its config into `.env.prod` as `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_PROJECT_ID`. These are
   build-time values - the frontend image must be rebuilt after a change.
   The Web API key is a public client identifier, not a secret.

5. Set `ALLOWED_EMAIL_DOMAINS` to the email domains permitted to sign in. A
   Firebase ID token carries no hosted-domain claim, so this allowlist plus
   the requirement that a `users` row exist are the only access controls.

6. Leave `AUTH_MODE` unset. Enforce MFA and password policy on the Google
   accounts themselves, in Google Workspace.

### Configure MinIO

The MinIO **console is disabled and not routed** - it is an object-store
admin UI with no business on the public internet. `MINIO_BROWSER` defaults
to `off` and there is no Traefik router for it. Only the S3 API is published,
on `https://storage.<APP_DOMAIN>`, because the browser fetches evidence from
there through presigned URLs.

To reach the console deliberately:

```bash
# 1. Set MINIO_BROWSER=on in .env.prod, then restart just minio
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d minio

# 2. From your workstation, tunnel to the container's console port
#    (9001 is not published on the host)
ssh -L 9001:$(ssh HOST "docker inspect -f \
  '{{.NetworkSettings.Networks.grc-dmz.IPAddress}}' grc-minio"):9001 HOST

# 3. Open http://localhost:9001 and log in with MINIO_ROOT_USER /
#    MINIO_ROOT_PASSWORD. Set MINIO_BROWSER back to off when finished.
```

The application needs one bucket, named by `MINIO_BUCKET` (or `S3_BUCKET`),
defaulting to `grc-storage`. Create it with the console above or with the
`mc` client, keep it private, and let the application issue presigned URLs
rather than making objects public.

## Backup & Recovery

### Automated Backups

Backups are automatically performed using the included backup script.

#### Configure Backup Schedule

```bash
# Edit crontab
crontab -e

# Add backup schedule (daily at 2 AM)
0 2 * * * /opt/gigachad-grc/deploy/backup.sh >> /var/log/grc-backup.log 2>&1
```

#### Manual Backup

```bash
# Run backup script
cd /opt/gigachad-grc/deploy
./backup.sh
```

Backup includes:
- PostgreSQL database dump
- MinIO/S3 files
- Configuration files
- Docker volumes

Backups are stored in:
- Local: `/backups/gigachad-grc/`
- Retention: 30 days (configurable)

### Disaster Recovery

To restore from backup:

```bash
# Stop all services
cd /opt/gigachad-grc
docker compose -f docker-compose.prod.yml down

# Restore from backup
cd deploy
./restore.sh /backups/gigachad-grc/backup-YYYY-MM-DD-HHMMSS.tar.gz

# Start services
cd ..
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Verify restoration
docker compose -f docker-compose.prod.yml logs -f
```

### Backup to Remote Storage

Configure remote backup in `.env.prod`:

```bash
DR_REMOTE_BACKUP_ENABLED=true
DR_REMOTE_BACKUP_S3_BUCKET=grc-backups-remote
DR_REMOTE_BACKUP_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Monitoring & Logging

### Health Checks

Check service health:

```bash
# Check all services
docker compose -f docker-compose.prod.yml ps

# Check specific service health
docker compose -f docker-compose.prod.yml exec controls wget -O - http://localhost:3001/health

# View health check logs
docker inspect --format='{{json .State.Health}}' grc-postgres | jq
```

### Log Management

View logs:

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f controls

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100

# Follow logs with timestamps
docker compose -f docker-compose.prod.yml logs -f -t
```

Log rotation is configured automatically:
- Max size: 10MB per file
- Max files: 3 (30MB total per service)

### Metrics & Monitoring

An optional Prometheus/Grafana/Loki/Alertmanager stack ships with the repo:

```bash
docker compose -f docker-compose.yml \
  -f deploy/monitoring/docker-compose.monitoring.yml up -d
```

Its scrape configuration is `deploy/monitoring/prometheus.yml` and its alert
rules are `deploy/monitoring/alerts.yml`. Note what actually exposes metrics
today: only the **controls** service registers a Prometheus endpoint
(`controls:3001/metrics`, exposing `collectors_runs_total`,
`scheduled_notifications_runs_total` and `mcp_workflow_executions_total`),
plus MinIO, cAdvisor and node-exporter. The other five services expose
`GET /health` (JSON), which is a health endpoint, not a metrics endpoint -
scraping it would report the target as permanently down. Jobs for them are
present but commented out in `prometheus.yml`, each with the reason.

Nothing is exposed on the public host for monitoring: `docker-compose.prod.yml`
publishes only Traefik's 80 and 443, so reach Prometheus/Grafana over an SSH
tunnel.

### Application Performance Monitoring (APM)

No APM/error-tracking SDK is wired into the services: there is no Sentry (or
equivalent) initialisation in any `main.ts`, and no `SENTRY_*` variable is
read anywhere in the application. Error visibility today comes from the
JSON container logs above and the audit log. (The *integrations catalogue*
includes a Sentry connector, but that collects compliance evidence from a
customer's Sentry account - it does not instrument this platform.)

## Maintenance

### Updating the Application

```bash
# Backup before updating
./deploy/backup.sh

# Pull latest code
cd /opt/gigachad-grc
git fetch
git checkout v1.1.0  # or desired version

# Pull latest images
docker compose -f docker-compose.prod.yml --env-file .env.prod pull

# Rebuild custom images
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# Stop services (rolling update)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --build controls

# Verify the update
docker compose -f docker-compose.prod.yml logs -f controls

# Update remaining services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Database Maintenance

```bash
# Vacuum database
docker compose -f docker-compose.prod.yml exec postgres vacuumdb -U grc_prod_user -d gigachad_grc_prod --analyze

# Reindex database
docker compose -f docker-compose.prod.yml exec postgres reindexdb -U grc_prod_user -d gigachad_grc_prod

# Check database size
docker compose -f docker-compose.prod.yml exec postgres psql -U grc_prod_user -d gigachad_grc_prod -c "SELECT pg_size_pretty(pg_database_size('gigachad_grc_prod'));"
```

### Certificate Renewal

Let's Encrypt certificates auto-renew. To manually renew:

```bash
# Check certificate expiry
docker compose -f docker-compose.prod.yml exec traefik cat /letsencrypt/acme.json

# Force renewal (if needed)
docker compose -f docker-compose.prod.yml restart traefik
```

## Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check Docker daemon
sudo systemctl status docker

# Check logs for errors
docker compose -f docker-compose.prod.yml logs

# Verify environment variables
docker compose -f docker-compose.prod.yml config

# Check disk space
df -h

# Check memory
free -h
```

#### Database Connection Issues

```bash
# Test database connectivity
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Check database logs
docker compose -f docker-compose.prod.yml logs postgres

# Verify credentials
docker compose -f docker-compose.prod.yml exec postgres psql -U grc_prod_user -d gigachad_grc_prod -c "SELECT 1;"
```

#### SSL Certificate Issues

```bash
# Check Traefik logs
docker compose -f docker-compose.prod.yml logs traefik

# Verify DNS records
dig grc.example.com
dig storage.grc.example.com

# Check certificate
openssl s_client -connect grc.example.com:443 -servername grc.example.com

# Clear acme.json and restart (will regenerate certificates)
docker compose -f docker-compose.prod.yml down
docker volume rm gigachad-grc_traefik_letsencrypt
docker compose -f docker-compose.prod.yml up -d
```

#### High Memory Usage

```bash
# Check container stats
docker stats

# Check service-specific memory
docker compose -f docker-compose.prod.yml exec controls node -e "console.log(process.memoryUsage())"

# Adjust memory limits in docker-compose.prod.yml
# Restart services
docker compose -f docker-compose.prod.yml restart
```

#### Performance Issues

```bash
# Check system resources
htop

# Check database performance
docker compose -f docker-compose.prod.yml exec postgres psql -U grc_prod_user -d gigachad_grc_prod -c "SELECT * FROM pg_stat_activity;"

# Analyze slow queries
docker compose -f docker-compose.prod.yml exec postgres psql -U grc_prod_user -d gigachad_grc_prod -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Getting Help

1. Check logs: `docker compose logs -f [service_name]`
2. Review configuration: `docker compose config`
3. Check GitHub issues: https://github.com/yourusername/gigachad-grc/issues
4. Contact support: support@example.com

## Security Best Practices

### 1. Secrets Management

- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Rotate secrets every 90 days
- Never commit secrets to version control
- Use strong passwords (32+ characters)

### 2. Network Security

```bash
# Use firewall
sudo ufw enable
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp

# Configure fail2ban
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
```

### 3. Regular Updates

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Update Docker images
docker compose pull

# Update application
git pull
```

### 4. Monitoring & Alerts

- Set up monitoring (Prometheus/Grafana)
- Configure alerts for:
  - Service downtime
  - High resource usage
  - Failed authentications
  - Certificate expiration

### 5. Access Control

- Use SSH keys (disable password authentication)
- Enforce 2-Step Verification on the Google accounts that can sign in
  (there is no application-managed password to protect)
- Keep `ALLOWED_EMAIL_DOMAINS` as tight as possible, and leave
  `AUTH_AUTO_PROVISION=false` so an administrator must provision each user
- Follow principle of least privilege - use permission groups and per-user
  overrides rather than granting `admin`
- Regular security audits

### 6. Data Protection

- Enable encryption at rest
- Use SSL/TLS for all communications
- Regular backups (automated)
- Test disaster recovery procedures

### 7. Compliance

- Enable audit logging
- Retain logs per compliance requirements
- Regular security assessments
- Document procedures

## Production Checklist

Before going live:

- [ ] All secrets generated and configured
- [ ] `FIREBASE_PROJECT_ID`, `ALLOWED_EMAIL_DOMAINS` and the `VITE_FIREBASE_*` build values set
- [ ] `AUTH_MODE` unset and `NODE_ENV=production` (verified by `./deploy/preflight-check.sh`)
- [ ] First administrator `users` row created and sign-in verified end to end
- [ ] SSL certificates working
- [ ] DNS records configured
- [ ] Firewall rules applied
- [ ] Backups configured and tested
- [ ] Monitoring and alerting setup
- [ ] Log aggregation configured
- [ ] Disaster recovery tested
- [ ] Security scan completed
- [ ] Performance testing done
- [ ] Documentation reviewed
- [ ] Team trained on operations
- [ ] Incident response plan ready
- [ ] Compliance requirements met
- [ ] Contact information updated

## Support

For production support:

- **Email**: support@example.com
- **Slack**: #grc-support
- **On-call**: +1-XXX-XXX-XXXX
- **Documentation**: https://docs.example.com/grc

---

**Last Updated**: 2025-12-05
**Version**: 1.0.0
