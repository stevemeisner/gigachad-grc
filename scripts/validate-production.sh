#!/bin/bash

################################################################################
# GigaChad GRC - Production Validation Script
################################################################################
#
# This script validates that all required configuration is in place
# before deploying to production.
#
# Usage: ./scripts/validate-production.sh [--strict]
#
# Options:
#   --strict    Exit with error code on any warning (not just errors)
#
# Exit codes:
#   0 - All checks passed
#   1 - Critical errors found
#   2 - Warnings found (only with --strict)
#
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
PASSED=0

# Flags
STRICT_MODE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --strict)
            STRICT_MODE=true
            shift
            ;;
    esac
done

# Print banner
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         GigaChad GRC Production Validation                    ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
#
# The counters are incremented with an assignment, not with ((VAR++)): under
# `set -e` a post-increment whose OLD value is 0 returns exit status 1, which
# killed this script at its very first check.
pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    if [ -n "${2:-}" ]; then
        echo -e "  ${YELLOW}Recommendation:${NC} $2"
    fi
    WARNINGS=$((WARNINGS + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    if [ -n "${2:-}" ]; then
        echo -e "  ${RED}Action Required:${NC} $2"
    fi
    ERRORS=$((ERRORS + 1))
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Load the production environment file.
#
# .env.prod is the ONLY production env filename: deploy/env.example is copied
# to it, docker-compose.prod.yml is run with --env-file .env.prod and mounts it
# into the backup scheduler, and deploy/backup.sh, deploy/restore.sh and
# deploy/verify-backup.sh all read it. There is deliberately no .env fallback
# here - silently validating a different file than the one you deploy with is
# how the two names drifted apart in the first place.
#
# Set ENV_FILE=/path/to/file to validate a config kept somewhere else.
ENV_FILE="${ENV_FILE:-.env.prod}"
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    echo -e "${GREEN}Loaded environment from:${NC} $ENV_FILE"
else
    echo -e "${RED}Environment file not found:${NC} $ENV_FILE"
    ERRORS=$((ERRORS + 1))
fi

################################################################################
# Environment Checks
################################################################################

section "Environment Configuration"

# Check NODE_ENV
if [ "${NODE_ENV:-development}" = "production" ]; then
    pass "NODE_ENV is set to production"
else
    warn "NODE_ENV is not set to production (current: ${NODE_ENV:-development})" \
         "Set NODE_ENV=production in your environment"
fi

# Check if running in Docker
if [ -f "/.dockerenv" ]; then
    pass "Running inside Docker container"
else
    echo -e "  ${CYAN}ℹ${NC} Not running in Docker (local validation)"
fi

################################################################################
# Security Checks
################################################################################

section "Security Configuration"

# Check encryption key
if [ -z "${ENCRYPTION_KEY:-}" ]; then
    fail "ENCRYPTION_KEY is not set" \
         "Generate with: openssl rand -hex 32"
elif [ ${#ENCRYPTION_KEY} -lt 32 ]; then
    fail "ENCRYPTION_KEY is too short (${#ENCRYPTION_KEY} chars, need 32+)" \
         "Generate with: openssl rand -hex 32"
else
    pass "ENCRYPTION_KEY is properly configured"
fi

# Check for default passwords
DEFAULT_PASSWORDS=("password" "grc_secret" "minioadmin" "admin" "")

check_default_password() {
    local var_name=$1
    local var_value=${!var_name:-}
    
    for default in "${DEFAULT_PASSWORDS[@]}"; do
        if [ "$var_value" = "$default" ]; then
            return 0  # Is default
        fi
    done
    return 1  # Not default
}

if check_default_password "POSTGRES_PASSWORD"; then
    fail "POSTGRES_PASSWORD is using a default/weak value" \
         "Set a strong unique password"
else
    pass "POSTGRES_PASSWORD is not using default value"
fi

if check_default_password "MINIO_ROOT_PASSWORD"; then
    fail "MINIO_ROOT_PASSWORD is using a default/weak value" \
         "Set a strong unique password"
else
    pass "MINIO_ROOT_PASSWORD is not using default value"
fi

# deploy/env.example ships CHANGE_ME_* placeholders that are LONGER than the
# minimum lengths checked above, so a config that was copied and never filled
# in would otherwise validate clean and report its secrets as "properly
# configured". deploy/preflight-check.sh scanned the file for CHANGE_ME before
# it was deleted; this replaces that.
PLACEHOLDER_VARS=("POSTGRES_PASSWORD" "MINIO_ROOT_PASSWORD" "ENCRYPTION_KEY")
PLACEHOLDERS_FOUND=0
for var in "${PLACEHOLDER_VARS[@]}"; do
    case "${!var:-}" in
        *CHANGE_ME*)
            fail "$var still holds the CHANGE_ME placeholder from deploy/env.example" \
                 "Replace it with a generated value"
            PLACEHOLDERS_FOUND=$((PLACEHOLDERS_FOUND + 1))
            ;;
    esac
done
if [ "$PLACEHOLDERS_FOUND" -eq 0 ]; then
    pass "No CHANGE_ME placeholders remain in the configuration"
fi

################################################################################
# Authentication Checks
################################################################################

section "Authentication"

# Check Firebase Authentication configuration
if [ -n "${FIREBASE_PROJECT_ID:-}" ]; then
    pass "FIREBASE_PROJECT_ID is configured: ${FIREBASE_PROJECT_ID}"
else
    if [ "${NODE_ENV:-development}" = "production" ]; then
        fail "FIREBASE_PROJECT_ID is not configured for production" \
             "Set it to the Firebase project whose ID tokens the API accepts"
    else
        warn "FIREBASE_PROJECT_ID is not configured" \
             "Using the demo auth bypass - not suitable for production"
    fi
fi

# The frontend bundle is built from the VITE_* values, so a mismatch between
# VITE_FIREBASE_PROJECT_ID and FIREBASE_PROJECT_ID produces a frontend whose
# tokens the API guard rejects for the wrong audience. Worth catching here:
# otherwise it surfaces as "jwt audience invalid" only after a full image
# build. (deploy/preflight-check.sh was the only thing checking this before it
# was deleted.)
if [ -n "${FIREBASE_PROJECT_ID:-}" ] && [ -n "${VITE_FIREBASE_PROJECT_ID:-}" ]; then
    if [ "$FIREBASE_PROJECT_ID" = "$VITE_FIREBASE_PROJECT_ID" ]; then
        pass "VITE_FIREBASE_PROJECT_ID matches FIREBASE_PROJECT_ID"
    else
        fail "VITE_FIREBASE_PROJECT_ID ('$VITE_FIREBASE_PROJECT_ID') does not equal FIREBASE_PROJECT_ID ('$FIREBASE_PROJECT_ID')" \
             "Make them the same value and rebuild the frontend image, or every sign-in fails on token audience"
    fi
elif [ -z "${VITE_FIREBASE_PROJECT_ID:-}" ] && [ "${NODE_ENV:-development}" = "production" ]; then
    fail "VITE_FIREBASE_PROJECT_ID is not set - the frontend image would be built with no Firebase project" \
         "Set it to the same value as FIREBASE_PROJECT_ID"
fi

# A Firebase ID token carries no hosted-domain claim, so the allowlist is the
# only thing stopping any Google account from signing in.
if [ -n "${ALLOWED_EMAIL_DOMAINS:-}" ]; then
    pass "ALLOWED_EMAIL_DOMAINS is configured: ${ALLOWED_EMAIL_DOMAINS}"
elif [ "${NODE_ENV:-development}" = "production" ]; then
    fail "ALLOWED_EMAIL_DOMAINS is not set" \
         "Without it any Google account can obtain a valid ID token"
else
    warn "ALLOWED_EMAIL_DOMAINS is not set"
fi

# Auto-provisioning creates a user row on first sign-in; it needs a target org.
if [ "${AUTH_AUTO_PROVISION:-false}" = "true" ] && [ -z "${AUTH_DEFAULT_ORG_ID:-}" ]; then
    fail "AUTH_AUTO_PROVISION is enabled but AUTH_DEFAULT_ORG_ID is not set" \
         "Obtain one with: SELECT id, name FROM organizations;"
else
    pass "Auto-provisioning configuration is consistent"
fi

# The demo bypass skips token verification entirely.
if [ "${AUTH_MODE:-}" = "demo" ] && [ "${NODE_ENV:-development}" = "production" ]; then
    fail "AUTH_MODE=demo is set in production!" \
         "Unset AUTH_MODE so the Firebase auth guard verifies real ID tokens"
else
    pass "The demo auth bypass is not enabled in production"
fi

################################################################################
# Database Checks
################################################################################

section "Database Configuration"

if [ -n "${DATABASE_URL:-}" ]; then
    pass "DATABASE_URL is configured"
    
    # Check for SSL
    if [[ "${DATABASE_URL}" == *"sslmode=require"* ]] || [[ "${DATABASE_URL}" == *"ssl=true"* ]]; then
        pass "Database SSL is enabled"
    else
        if [ "${NODE_ENV:-development}" = "production" ]; then
            warn "Database SSL is not enabled" \
                 "Add ?sslmode=require to DATABASE_URL for production"
        else
            echo -e "  ${CYAN}ℹ${NC} Database SSL not enabled (acceptable for development)"
        fi
    fi
else
    fail "DATABASE_URL is not set" \
         "Configure the PostgreSQL connection string"
fi

################################################################################
# Storage Checks
################################################################################

section "Object Storage"

if [ -n "${MINIO_ENDPOINT:-}" ] || [ -n "${S3_ENDPOINT:-}" ]; then
    pass "Object storage endpoint is configured"
else
    warn "Object storage endpoint is not configured" \
         "Set MINIO_ENDPOINT or S3_ENDPOINT for file storage"
fi

if [ "${MINIO_USE_SSL:-false}" = "true" ] || [ "${S3_USE_SSL:-false}" = "true" ]; then
    pass "Object storage SSL is enabled"
else
    if [ "${NODE_ENV:-development}" = "production" ]; then
        warn "Object storage SSL is not enabled" \
             "Enable SSL for production: MINIO_USE_SSL=true"
    else
        echo -e "  ${CYAN}ℹ${NC} Object storage SSL not enabled (acceptable for development)"
    fi
fi

################################################################################
# Backup Checks
################################################################################

section "Backup Configuration"

# Check backup script exists
if [ -f "deploy/backup.sh" ]; then
    pass "Backup script exists"
    
    if [ -x "deploy/backup.sh" ]; then
        pass "Backup script is executable"
    else
        warn "Backup script is not executable" \
             "Run: chmod +x deploy/backup.sh"
    fi
else
    warn "Backup script not found" \
         "Ensure deploy/backup.sh exists"
fi

# Check remote backup configuration
if [ "${DR_REMOTE_BACKUP_ENABLED:-false}" = "true" ]; then
    pass "Remote backup is enabled"
    
    if [ -n "${DR_REMOTE_BACKUP_S3_BUCKET:-}" ]; then
        pass "Remote backup bucket is configured"
    else
        warn "Remote backup bucket is not set" \
             "Set DR_REMOTE_BACKUP_S3_BUCKET"
    fi
else
    if [ "${NODE_ENV:-development}" = "production" ]; then
        warn "Remote backup is not enabled" \
             "Enable for disaster recovery: DR_REMOTE_BACKUP_ENABLED=true"
    else
        echo -e "  ${CYAN}ℹ${NC} Remote backup not enabled (recommended for production)"
    fi
fi

# Check backup retention
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
if [ "$RETENTION" -ge 30 ]; then
    pass "Backup retention is ${RETENTION} days"
elif [ "$RETENTION" -ge 7 ]; then
    warn "Backup retention is only ${RETENTION} days" \
         "Consider increasing to 30+ days for compliance"
else
    fail "Backup retention is too short (${RETENTION} days)" \
         "Increase BACKUP_RETENTION_DAYS to at least 7"
fi

################################################################################
# Network & CORS Checks
################################################################################

section "Network Configuration"

# Check CORS
if [ "${CORS_ORIGINS:-}" = "*" ]; then
    if [ "${NODE_ENV:-development}" = "production" ]; then
        warn "CORS allows all origins (wildcard)" \
             "Restrict CORS_ORIGINS to specific domains in production"
    else
        echo -e "  ${CYAN}ℹ${NC} CORS allows all origins (acceptable for development)"
    fi
elif [ -n "${CORS_ORIGINS:-}" ]; then
    pass "CORS is restricted to specific origins"
else
    echo -e "  ${CYAN}ℹ${NC} CORS using default configuration"
fi

# Check rate limiting
if [ "${RATE_LIMIT_ENABLED:-true}" != "false" ]; then
    pass "Rate limiting is enabled"
else
    if [ "${NODE_ENV:-development}" = "production" ]; then
        warn "Rate limiting is disabled" \
             "Enable rate limiting for production"
    fi
fi

################################################################################
# Monitoring Checks
################################################################################

section "Monitoring & Logging"

# Check Sentry
if [ -n "${SENTRY_DSN:-}" ]; then
    pass "Sentry error tracking is configured"
else
    warn "Sentry is not configured" \
         "Consider adding SENTRY_DSN for error tracking"
fi

# Check log level
LOG_LEVEL="${LOG_LEVEL:-info}"
if [ "$LOG_LEVEL" = "debug" ] && [ "${NODE_ENV:-development}" = "production" ]; then
    warn "Log level is 'debug' in production" \
         "Use 'info' or 'warn' for better performance"
else
    pass "Log level is set to: $LOG_LEVEL"
fi

################################################################################
# Email Delivery Checks
################################################################################

section "Email Delivery"

# services/controls/src/email/email.service.ts chooses the transport from
# EMAIL_PROVIDER. Two things about it drive the checks below:
#
#   1. An unset EMAIL_PROVIDER defaults to 'smtp'. An unrecognised value is
#      its own failure - the service no longer treats a typo as 'smtp'.
#   2. When the selected provider's configuration is incomplete the service
#      refuses to start under NODE_ENV=production, and falls back to console
#      mode everywhere else. Refusing to start is loud, but it is loud at
#      container start, after the deploy.
#
# So these checks are where that failure is cheap.
EMAIL_PROVIDER_VALUE="${EMAIL_PROVIDER:-smtp}"

case "$EMAIL_PROVIDER_VALUE" in
    console)
        if [ "${NODE_ENV:-development}" = "production" ]; then
            fail "EMAIL_PROVIDER=console with NODE_ENV=production - notification emails are written to the container log and never sent" \
                 "Set EMAIL_PROVIDER to resend, smtp, sendgrid or ses and fill in its variables"
        else
            pass "EMAIL_PROVIDER=console (emails are logged, not sent - acceptable outside production)"
        fi
        ;;
    smtp)
        SMTP_COMPLETE=true
        if [ -z "${SMTP_HOST:-}" ]; then
            fail "EMAIL_PROVIDER=smtp but SMTP_HOST is not set - the email service refuses to start in production, and logs instead of sending everywhere else" \
                 "Set SMTP_HOST, or choose another EMAIL_PROVIDER"
            SMTP_COMPLETE=false
        fi
        if [ -z "${SMTP_USER:-}" ]; then
            fail "EMAIL_PROVIDER=smtp but SMTP_USER is not set - the email service refuses to start in production, and logs instead of sending everywhere else" \
                 "Set SMTP_USER, or choose another EMAIL_PROVIDER"
            SMTP_COMPLETE=false
        fi
        if [ -z "${SMTP_PASS:-}" ]; then
            fail "EMAIL_PROVIDER=smtp but SMTP_PASS is not set - the email service refuses to start in production, and logs instead of sending everywhere else" \
                 "Set SMTP_PASS, or choose another EMAIL_PROVIDER"
            SMTP_COMPLETE=false
        fi
        if [ -z "${SMTP_PORT:-}" ]; then
            warn "SMTP_PORT is not set - the email service uses 587" \
                 "Set SMTP_PORT explicitly if your relay listens elsewhere"
        fi
        if [ "$SMTP_COMPLETE" = true ]; then
            pass "SMTP delivery configured (host, user and password all set)"
        fi
        ;;
    resend)
        # The API key is the only Resend variable: the host, the port and the
        # username ('resend', literally) are fixed in the service.
        if [ -z "${RESEND_API_KEY:-}" ]; then
            fail "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set - the email service refuses to start in production, and logs instead of sending everywhere else" \
                 "Set RESEND_API_KEY to a key from the Resend dashboard, or choose another EMAIL_PROVIDER"
        else
            pass "Resend delivery configured (RESEND_API_KEY is set)"
        fi
        ;;
    sendgrid)
        if [ -z "${SENDGRID_API_KEY:-}" ]; then
            fail "EMAIL_PROVIDER=sendgrid but SENDGRID_API_KEY is not set - the email service refuses to start in production, and logs instead of sending everywhere else" \
                 "Set SENDGRID_API_KEY, or choose another EMAIL_PROVIDER"
        else
            pass "SendGrid delivery configured (SENDGRID_API_KEY is set)"
        fi
        ;;
    ses)
        SES_COMPLETE=true
        # The service defaults the region to us-east-1, which silently sends
        # from the wrong region if your verified identity lives elsewhere.
        if [ -z "${AWS_REGION:-}" ]; then
            fail "EMAIL_PROVIDER=ses but AWS_REGION is not set - the email service would assume us-east-1, where your sending identity may not be verified" \
                 "Set AWS_REGION to the region holding your verified SES identity"
            SES_COMPLETE=false
        fi
        if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
            fail "EMAIL_PROVIDER=ses but AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are incomplete - the email service refuses to start in production, and logs instead of sending everywhere else" \
                 "Set both SES SMTP credentials, or choose another EMAIL_PROVIDER"
            SES_COMPLETE=false
        fi
        if [ "$SES_COMPLETE" = true ]; then
            pass "AWS SES delivery configured (region and credentials set)"
        fi
        ;;
    *)
        fail "EMAIL_PROVIDER='$EMAIL_PROVIDER_VALUE' is not a recognised provider - the email service refuses to start on a value it does not know" \
             "Use console, smtp, resend, sendgrid or ses"
        ;;
esac

# EMAIL_FROM stopped being optional. Resend rejects any From address outside a
# verified domain, and the service no longer defaults to a placeholder domain
# that nobody owns, so a real provider with no EMAIL_FROM sends nothing.
if [ "$EMAIL_PROVIDER_VALUE" != "console" ]; then
    if [ -n "${EMAIL_FROM:-}" ]; then
        pass "EMAIL_FROM is set ($EMAIL_FROM)"
    elif [ "${NODE_ENV:-development}" = "production" ]; then
        fail "EMAIL_PROVIDER=$EMAIL_PROVIDER_VALUE but EMAIL_FROM is not set - the email service refuses to start without a sender address" \
             "Set EMAIL_FROM to an address on a domain your provider is allowed to send from"
    else
        warn "EMAIL_PROVIDER=$EMAIL_PROVIDER_VALUE but EMAIL_FROM is not set - the email service falls back to logging outside production" \
             "Set EMAIL_FROM before deploying with NODE_ENV=production"
    fi
fi

################################################################################
# File System Checks
################################################################################

section "File System"

# Check if required directories exist
REQUIRED_DIRS=("deploy" "database/init")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        pass "Directory exists: $dir"
    else
        warn "Directory not found: $dir"
    fi
done

# Check Docker Compose files
if [ -f "docker-compose.prod.yml" ]; then
    pass "Production Docker Compose file exists"
else
    warn "docker-compose.prod.yml not found" \
         "Create a production-specific Docker Compose configuration"
fi

################################################################################
# Host Prerequisite Checks
################################################################################
#
# These four checks are the only ones deploy/preflight-check.sh performed that
# this script did not. That script was deleted rather than repaired, because
# two overlapping readiness checks that can disagree with each other are worse
# than one, so its machine-level checks live here now.

section "Host Prerequisites"

if command -v docker >/dev/null 2>&1; then
    pass "docker is installed"
    if docker info >/dev/null 2>&1; then
        pass "docker daemon is running"

        # Reported in bytes; compared in MB because the documented target is a
        # 4 GB VM, which reports slightly less than 4096 MB.
        DOCKER_MEM_BYTES="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"
        DOCKER_MEM_MB=$((DOCKER_MEM_BYTES / 1024 / 1024))
        if [ "$DOCKER_MEM_MB" -ge 3500 ]; then
            pass "Docker has ${DOCKER_MEM_MB}MB of memory available"
        elif [ "$DOCKER_MEM_MB" -ge 1900 ]; then
            warn "Docker has only ${DOCKER_MEM_MB}MB of memory" \
                 "The full stack is sized for a 4GB host; expect the build to be the tight part"
        else
            fail "Docker has ${DOCKER_MEM_MB}MB of memory - too little to run the stack" \
                 "Deploy onto a host with at least 4GB"
        fi
    else
        fail "docker daemon is not running" \
             "Start Docker before deploying"
    fi
else
    fail "docker is not installed" \
         "Install Docker Engine and the compose plugin"
fi

if docker compose version >/dev/null 2>&1; then
    pass "docker compose (v2 plugin) is available"
else
    fail "docker compose v2 is not available" \
         "Install the Docker compose plugin; the deploy commands all use 'docker compose'"
fi

# Only Traefik publishes host ports (80/443); every other service is reached
# through the gateway on the internal network, so nothing else can conflict.
# A port already in use is a warning, not an error - on a host that is already
# running the stack, that is exactly what you would expect to see.
for port in 80 443; do
    if lsof -i ":$port" >/dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":$port "; then
        warn "Port $port is already in use" \
             "Free it, or confirm it is this stack's own Traefik already running"
    else
        pass "Port $port is available"
    fi
done

DISK_AVAIL_GB="$(df -g . 2>/dev/null | awk 'NR==2 {print $4}' || echo "")"
if [ -z "$DISK_AVAIL_GB" ]; then
    DISK_AVAIL_GB="$(df -BG . 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G' || echo "")"
fi
if [ -n "$DISK_AVAIL_GB" ]; then
    if [ "$DISK_AVAIL_GB" -ge 20 ]; then
        pass "Disk space available: ${DISK_AVAIL_GB}GB"
    elif [ "$DISK_AVAIL_GB" -ge 10 ]; then
        warn "Disk space available: ${DISK_AVAIL_GB}GB" \
             "Images, volumes and backups want 20GB or more"
    else
        fail "Disk space available: ${DISK_AVAIL_GB}GB - not enough to build and run the stack" \
             "Free space or resize the volume before deploying"
    fi
else
    warn "Could not determine available disk space"
fi

################################################################################
# Summary
################################################################################

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                        Summary                                 ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "  ${RED}Errors:${NC}   $ERRORS"
echo ""

# Calculate score
TOTAL=$((PASSED + WARNINGS + ERRORS))
if [ $TOTAL -gt 0 ]; then
    # Weight: passed=1, warnings=0.5, errors=0
    SCORE=$(( (PASSED * 100 + WARNINGS * 50) / TOTAL ))
    
    if [ $SCORE -ge 80 ]; then
        SCORE_COLOR=$GREEN
    elif [ $SCORE -ge 60 ]; then
        SCORE_COLOR=$YELLOW
    else
        SCORE_COLOR=$RED
    fi
    
    echo -e "  ${CYAN}Production Readiness Score:${NC} ${SCORE_COLOR}${SCORE}/100${NC}"
    echo ""
fi

# Determine exit code
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ Validation FAILED - $ERRORS critical error(s) found${NC}"
    echo -e "${RED}   These issues must be resolved before production deployment.${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ] && [ "$STRICT_MODE" = true ]; then
    echo -e "${YELLOW}⚠️  Validation completed with warnings (strict mode)${NC}"
    echo -e "${YELLOW}   Address warnings before production deployment.${NC}"
    exit 2
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Validation completed with warnings${NC}"
    echo -e "${YELLOW}   Consider addressing warnings for optimal security.${NC}"
    exit 0
else
    echo -e "${GREEN}✅ Validation PASSED - System is production ready!${NC}"
    exit 0
fi

