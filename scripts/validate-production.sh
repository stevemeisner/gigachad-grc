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
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    if [ -n "${2:-}" ]; then
        echo -e "  ${YELLOW}Recommendation:${NC} $2"
    fi
    ((WARNINGS++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    if [ -n "${2:-}" ]; then
        echo -e "  ${RED}Action Required:${NC} $2"
    fi
    ((ERRORS++))
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Load environment file if it exists
ENV_FILE="${ENV_FILE:-.env.prod}"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo -e "${GREEN}Loaded environment from:${NC} $ENV_FILE"
else
    if [ -f ".env" ]; then
        set -a
        source ".env"
        set +a
        echo -e "${YELLOW}Using .env file (consider using .env.prod for production)${NC}"
    fi
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

# Check JWT secret
if [ -z "${JWT_SECRET:-}" ]; then
    warn "JWT_SECRET is not set" \
         "Generate with: openssl rand -base64 64"
elif [ ${#JWT_SECRET} -lt 32 ]; then
    warn "JWT_SECRET is short (${#JWT_SECRET} chars)" \
         "Generate a longer secret with: openssl rand -base64 64"
else
    pass "JWT_SECRET is properly configured"
fi

# Check session secret
if [ -z "${SESSION_SECRET:-}" ]; then
    warn "SESSION_SECRET is not set" \
         "Generate with: openssl rand -base64 64"
elif [ ${#SESSION_SECRET} -lt 32 ]; then
    warn "SESSION_SECRET is short (${#SESSION_SECRET} chars)" \
         "Generate a longer secret with: openssl rand -base64 64"
else
    pass "SESSION_SECRET is properly configured"
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

