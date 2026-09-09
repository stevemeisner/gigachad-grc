#!/bin/bash
# =============================================================================
# GigaChad GRC - Pre-deployment Check Script
# =============================================================================
# Run this script before deploying to verify your environment is ready
# Usage: ./deploy/preflight-check.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          GigaChad GRC - Pre-deployment Check                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Helper Functions
# =============================================================================

check_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "  ${RED}✗${NC} $1"
    ((ERRORS++))
}

check_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

check_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# =============================================================================
# 1. Check Required Tools
# =============================================================================

section "Checking Required Tools"

# Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | tr -d ',')
    check_pass "Docker installed (v$DOCKER_VERSION)"
else
    check_fail "Docker not installed"
fi

# Docker Compose
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null 2>&1; then
    if docker compose version &> /dev/null 2>&1; then
        COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    else
        COMPOSE_VERSION=$(docker-compose --version | cut -d ' ' -f4 | tr -d ',')
    fi
    check_pass "Docker Compose installed (v$COMPOSE_VERSION)"
else
    check_fail "Docker Compose not installed"
fi

# Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d ' ' -f3)
    check_pass "Git installed (v$GIT_VERSION)"
else
    check_warn "Git not installed (optional)"
fi

# curl (for health checks)
if command -v curl &> /dev/null; then
    check_pass "curl installed"
else
    check_warn "curl not installed (recommended for health checks)"
fi

# =============================================================================
# 2. Check Environment File
# =============================================================================

section "Checking Environment Configuration"

# The production deployment lives in .env.prod (docker-compose.prod.yml is run
# with --env-file .env.prod, and deploy/backup.sh reads the same file). Fall
# back to .env for a local stack. Run from the repository root.
for candidate in ".env.prod" "../.env.prod" ".env" "../.env"; do
    if [ -f "$candidate" ]; then
        ENV_FILE="$candidate"
        break
    fi
done
ENV_FILE="${ENV_FILE:-.env.prod}"

if [ -f "$ENV_FILE" ]; then
    check_pass "Environment file found ($ENV_FILE)"
    
    # Check for default/insecure passwords
    if grep -q "CHANGE_ME" "$ENV_FILE" 2>/dev/null; then
        check_fail "Default passwords detected - update CHANGE_ME values"
    else
        check_pass "No default passwords detected"
    fi
    
    # Check required variables
    REQUIRED_VARS=(
        "POSTGRES_USER"
        "POSTGRES_PASSWORD"
        "POSTGRES_DB"
        "FIREBASE_PROJECT_ID"
        "ALLOWED_EMAIL_DOMAINS"
        "VITE_FIREBASE_API_KEY"
        "VITE_FIREBASE_AUTH_DOMAIN"
        "VITE_FIREBASE_PROJECT_ID"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
        "APP_DOMAIN"
        "ACME_EMAIL"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
            VALUE=$(grep "^${var}=" "$ENV_FILE" | cut -d '=' -f2)
            if [ -z "$VALUE" ]; then
                check_fail "$var is empty"
            else
                check_pass "$var is set"
            fi
        else
            check_fail "$var is not defined"
        fi
    done
    
    # Check password strength
    POSTGRES_PW=$(grep "^POSTGRES_PASSWORD=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    if [ ${#POSTGRES_PW} -lt 16 ]; then
        check_warn "POSTGRES_PASSWORD should be at least 16 characters"
    fi
    
    JWT_SECRET=$(grep "^JWT_SECRET=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    if [ ${#JWT_SECRET} -lt 32 ]; then
        check_warn "JWT_SECRET should be at least 32 characters"
    fi

    # The frontend bundle is built from the VITE_* values, so a mismatch
    # between VITE_FIREBASE_PROJECT_ID and FIREBASE_PROJECT_ID produces a
    # frontend whose tokens the backend guard will always reject.
    BACKEND_PROJECT=$(grep "^FIREBASE_PROJECT_ID=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    FRONTEND_PROJECT=$(grep "^VITE_FIREBASE_PROJECT_ID=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    if [ -n "$BACKEND_PROJECT" ] && [ "$BACKEND_PROJECT" != "$FRONTEND_PROJECT" ]; then
        check_fail "VITE_FIREBASE_PROJECT_ID must equal FIREBASE_PROJECT_ID"
    fi

    # The only auth bypass in the codebase is AUTH_MODE=demo (backend) /
    # VITE_AUTH_MODE=demo (frontend). The backend guard hard-throws when
    # NODE_ENV=production, so a deployment carrying it will not start.
    if grep -Eq "^(AUTH_MODE|VITE_AUTH_MODE)=demo" "$ENV_FILE" 2>/dev/null; then
        check_fail "AUTH_MODE/VITE_AUTH_MODE is set to 'demo' - remove it before deploying"
    else
        check_pass "Demo auth bypass is not enabled"
    fi

    ENV_NODE_ENV=$(grep "^NODE_ENV=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    if [ "$ENV_NODE_ENV" = "production" ]; then
        check_pass "NODE_ENV is production"
    else
        check_warn "NODE_ENV is '${ENV_NODE_ENV:-unset}' - production deployments must set NODE_ENV=production"
    fi
    
else
    check_fail "Environment file not found (looked for .env.prod and .env)"
    check_info "Copy deploy/env.example to .env.prod and configure it"
fi

# =============================================================================
# 3. Check Docker Resources
# =============================================================================

section "Checking Docker Resources"

# Check if Docker daemon is running
if docker info &> /dev/null; then
    check_pass "Docker daemon is running"
    
    # Check available memory
    DOCKER_MEM=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo "0")
    DOCKER_MEM_GB=$((DOCKER_MEM / 1024 / 1024 / 1024))
    if [ "$DOCKER_MEM_GB" -ge 8 ]; then
        check_pass "Docker has ${DOCKER_MEM_GB}GB memory available"
    elif [ "$DOCKER_MEM_GB" -ge 4 ]; then
        check_warn "Docker has ${DOCKER_MEM_GB}GB memory (8GB+ recommended)"
    else
        check_fail "Docker has ${DOCKER_MEM_GB}GB memory (8GB+ required)"
    fi
else
    check_fail "Docker daemon is not running"
fi

# =============================================================================
# 4. Check Port Availability
# =============================================================================

section "Checking Port Availability"

# Ports the production stack publishes on the host (docker-compose.prod.yml
# maps only Traefik's 80/443). Frontend 3000, controls 3001, frameworks 3002,
# policies 3004, tprm 3005, trust 3006, audit 3007, postgres 5432 and
# minio 9000/9001 stay on the internal Docker network and are reached through
# the nginx gateway, so a local process on those ports does not block a deploy.
REQUIRED_PORTS=(80 443)

for port in "${REQUIRED_PORTS[@]}"; do
    if lsof -i ":$port" &> /dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":$port "; then
        check_warn "Port $port is in use"
    else
        check_pass "Port $port is available"
    fi
done

# =============================================================================
# 5. Check Disk Space
# =============================================================================

section "Checking Disk Space"

# Get available disk space in GB
if command -v df &> /dev/null; then
    DISK_AVAIL=$(df -BG . 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$DISK_AVAIL" -ge 20 ]; then
        check_pass "Disk space: ${DISK_AVAIL}GB available"
    elif [ "$DISK_AVAIL" -ge 10 ]; then
        check_warn "Disk space: ${DISK_AVAIL}GB available (20GB+ recommended)"
    else
        check_fail "Disk space: ${DISK_AVAIL}GB available (20GB+ required)"
    fi
fi

# =============================================================================
# 6. Check Configuration Files
# =============================================================================

section "Checking Configuration Files"

# Check docker-compose files
if [ -f "docker-compose.yml" ]; then
    check_pass "docker-compose.yml found"
else
    check_fail "docker-compose.yml not found"
fi

if [ -f "docker-compose.prod.yml" ]; then
    check_pass "docker-compose.prod.yml found"
else
    check_fail "docker-compose.prod.yml not found"
fi

# Check the nginx gateway config - docker-compose.prod.yml mounts it read-only
# into the gateway container, which is the single public entrypoint
if [ -f "gateway/nginx.conf" ]; then
    check_pass "Gateway routing configuration found (gateway/nginx.conf)"
else
    check_fail "gateway/nginx.conf not found"
fi

# Check Traefik static configuration
if [ -f "gateway/traefik.yml" ]; then
    check_pass "Traefik configuration found (gateway/traefik.yml)"
else
    check_warn "gateway/traefik.yml not found"
fi

# Check database init scripts
if [ -d "database/init" ] && [ "$(ls -A database/init 2>/dev/null)" ]; then
    INIT_SCRIPTS=$(ls database/init/*.sql 2>/dev/null | wc -l)
    check_pass "Database init scripts found ($INIT_SCRIPTS files)"
else
    check_warn "No database init scripts found"
fi

# =============================================================================
# 7. Check Service Dockerfiles
# =============================================================================

section "Checking Service Dockerfiles"

SERVICES=(controls frameworks policies tprm trust audit)

for service in "${SERVICES[@]}"; do
    if [ -f "services/$service/Dockerfile" ]; then
        check_pass "$service service Dockerfile found"
    else
        check_fail "$service service Dockerfile not found"
    fi
done

# Check frontend
if [ -f "frontend/Dockerfile" ]; then
    check_pass "Frontend Dockerfile found"
else
    check_fail "Frontend Dockerfile not found"
fi

# =============================================================================
# 8. Check SSL/TLS (Production Only)
# =============================================================================

section "Checking SSL/TLS Configuration"

if [ -f "$ENV_FILE" ]; then
    DOMAIN=$(grep "^APP_DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    ACME_EMAIL=$(grep "^ACME_EMAIL=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2)
    
    if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
        check_info "Domain configured: $DOMAIN"
        
        if [ -n "$ACME_EMAIL" ] && [ "$ACME_EMAIL" != "admin@example.com" ]; then
            check_pass "ACME email configured for Let's Encrypt"
        else
            check_warn "ACME email not properly configured"
        fi
    else
        check_info "Local development mode (no SSL required)"
    fi
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                         Summary                                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All checks passed! Ready for deployment.${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "  ${YELLOW}⚠ $WARNINGS warning(s) found. Review before deploying.${NC}"
else
    echo -e "  ${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found.${NC}"
    echo -e "  ${RED}  Please fix the errors before deploying.${NC}"
fi

echo ""
echo -e "  Errors:   $ERRORS"
echo -e "  Warnings: $WARNINGS"
echo ""

# Exit with error code if there are critical errors
if [ $ERRORS -gt 0 ]; then
    exit 1
fi

exit 0





