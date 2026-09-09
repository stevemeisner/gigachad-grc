#!/usr/bin/env bash
#
# ============================================================================
# GigaChad GRC - One-Click Demo Launcher
# ============================================================================
#
# Brings the whole platform up locally: infrastructure in Docker, the six
# NestJS services and the Vite dev server on the host.
#
# USAGE:
#   ./scripts/start-demo.sh [--skip-build] [--no-seed] [--no-browser]
#
# PREREQUISITES:
#   - Docker (Desktop, Colima, or Engine) running
#   - Node.js 18+ and npm
#
# WHAT THIS SCRIPT DOES:
#   1. Checks prerequisites and that every required host port is free
#   2. Creates .env from env.development if missing
#   3. Starts infrastructure (PostgreSQL, Redis, Keycloak, MinIO)
#   4. Creates the database schema with `prisma db push`
#   5. Inserts the development organization/user rows
#   6. Builds the shared library and the six services
#   7. Starts all six services and the frontend
#   8. Loads demo data on first run, then opens your browser
#
# STOPPING THE DEMO:
#   Press Ctrl+C, or run ./scripts/stop-demo.sh from another terminal.
#
# WHY SERVICES RUN ON THE HOST
#   docker-compose.yml can build and run them too, but that is a 25-60 minute
#   first build. Compiling on the host takes ~15 seconds and is the workflow
#   env.development was written for. See README.md ("Running the full
#   container stack") if you want everything in Docker instead.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

RUN_DIR="$PROJECT_ROOT/.demo"
LOG_DIR="$RUN_DIR/logs"
PID_FILE="$RUN_DIR/pids"

# Backend services and the ports they listen on. There is deliberately no
# 3003: that port belongs to Grafana in docker-compose.yml.
SERVICE_NAMES=(controls frameworks policies tprm trust audit)
SERVICE_PORTS=(3001      3002       3004     3005 3006  3007)

FRONTEND_PORT=3000
INFRA_SERVICES=(postgres redis keycloak minio)
# Host ports published by the infrastructure containers.
INFRA_PORTS=(5433 6380 8080 9000 9001)

SKIP_BUILD=false
RUN_SEED=true
OPEN_BROWSER=true

for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
        --no-seed)    RUN_SEED=false ;;
        --no-browser) OPEN_BROWSER=false ;;
        -h|--help)    sed -n '3,34p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
    esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "   $*"; }
ok()    { echo -e "${GREEN}   ✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}   ⚠ $*${NC}"; }
die()   { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }
step()  { echo ""; echo -e "${YELLOW}[$1/8] $2${NC}"; }

# ----------------------------------------------------------------------------
# Shutdown
# ----------------------------------------------------------------------------

cleanup() {
    trap - SIGINT SIGTERM EXIT
    echo ""
    echo -e "${YELLOW}🛑 Stopping demo processes...${NC}"
    if [ -f "$PID_FILE" ]; then
        while read -r name pid; do
            if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                info "stopped $name (pid $pid)"
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    echo ""
    echo "Containers are still running. To stop them too:"
    echo "  ./scripts/stop-demo.sh"
    echo ""
    exit 0
}
trap cleanup SIGINT SIGTERM

record_pid() { printf '%s %s\n' "$1" "$2" >> "$PID_FILE"; }

# Returns 0 when something is listening on the given TCP port.
port_in_use() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3<&- && return 0
    (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null && exec 3<&- && return 0
    return 1
}

wait_for_port() {
    local port=$1 label=$2 attempts=${3:-60} i=0
    while [ "$i" -lt "$attempts" ]; do
        port_in_use "$port" && { ok "$label ready on :$port"; return 0; }
        i=$((i + 1)); sleep 1
    done
    return 1
}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   ${GREEN}🚀 GigaChad GRC - One-Click Demo${BLUE}                            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"

# ----------------------------------------------------------------------------
step 1 "Checking prerequisites..."
# ----------------------------------------------------------------------------

command -v docker >/dev/null 2>&1 || die "Docker is not installed. https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker and try again."
ok "Docker is running"

docker compose version >/dev/null 2>&1 || die "The 'docker compose' plugin is required (Compose v2)."

command -v node >/dev/null 2>&1 || die "Node.js is not installed. https://nodejs.org/"
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18+ required (found $(node --version))."
ok "Node.js $(node --version)"

command -v npm >/dev/null 2>&1 || die "npm is not installed."
ok "npm $(npm --version)"

# Fail fast and name the conflict rather than dying halfway through startup.
CONFLICTS=()
for port in "${SERVICE_PORTS[@]}" "$FRONTEND_PORT" "${INFRA_PORTS[@]}"; do
    port_in_use "$port" && CONFLICTS+=("$port")
done
if [ ${#CONFLICTS[@]} -gt 0 ]; then
    echo ""
    die "Ports already in use: ${CONFLICTS[*]}
   Free them, or stop a previous run with ./scripts/stop-demo.sh
   Find the owner with:  lsof -nP -iTCP:${CONFLICTS[0]} -sTCP:LISTEN"
fi
ok "All required ports are free"

mkdir -p "$LOG_DIR"
: > "$PID_FILE"

# ----------------------------------------------------------------------------
step 2 "Setting up environment..."
# ----------------------------------------------------------------------------

if [ ! -f ".env" ]; then
    cp env.development .env
    ok "Created .env from env.development"
else
    ok ".env already exists"
fi

# A .env carrying NODE_ENV=production makes DevAuthGuard throw on every
# request (see services/*/src/auth/dev-auth.guard.ts). Earlier versions of
# this script seeded .env from deploy/env.example, which sets production.
if grep -qE '^NODE_ENV=production' .env; then
    die "Your .env sets NODE_ENV=production, which disables development auth.
   The demo cannot run against it. Use the development template instead:
     mv .env .env.production.bak && cp env.development .env"
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a
ok "Environment loaded (NODE_ENV=${NODE_ENV:-development})"

# ----------------------------------------------------------------------------
step 3 "Starting infrastructure (PostgreSQL, Redis, Keycloak, MinIO)..."
# ----------------------------------------------------------------------------

# Keycloak is not optional even though the demo uses Dev Login: the SPA runs
# keycloak.init({ onLoad: 'check-sso' }) on every page load, and a missing
# Keycloak turns that into a hard navigation failure before the login screen
# ever renders. See frontend/src/contexts/AuthContext.tsx.
docker compose up -d "${INFRA_SERVICES[@]}"

info "Waiting for PostgreSQL..."
PG_READY=false
for _ in $(seq 1 60); do
    if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-grc}" >/dev/null 2>&1; then
        PG_READY=true; break
    fi
    sleep 1
done
[ "$PG_READY" = true ] || die "PostgreSQL did not become ready. Check: docker compose logs postgres"
ok "PostgreSQL ready"

# The realm name is defined by the file Keycloak imports at startup, not by
# .env, so read it from there rather than trusting a duplicate setting.
KC_REALM="$(node -p "require('./auth/realm-export.json').realm")"
info "Waiting for Keycloak realm '$KC_REALM'..."
KC_READY=false
for _ in $(seq 1 90); do
    if curl -fsS "http://localhost:8080/realms/$KC_REALM" >/dev/null 2>&1; then
        KC_READY=true; break
    fi
    sleep 2
done
if [ "$KC_READY" = true ]; then
    ok "Keycloak ready"
else
    warn "Keycloak realm not reachable yet; the login page may fail to load."
    warn "Check: docker compose logs keycloak"
fi

# ----------------------------------------------------------------------------
step 4 "Applying database schema..."
# ----------------------------------------------------------------------------

# The schema is owned by Prisma. `db push` is used rather than `migrate deploy`
# because the repository ships no baseline migration for schema.prisma.
#
# stdin is closed deliberately: when the Prisma CLI sees an interactive
# terminal it can stop and wait for input, which silently hangs this script.
# Output goes to a log rather than /dev/null so a real failure is diagnosable.
if ! npx prisma db push \
        --schema=services/shared/prisma/schema.prisma \
        --skip-generate </dev/null >"$LOG_DIR/db-push.log" 2>&1; then
    # Keycloak used to share this database, so a volume created before that
    # was fixed still has ~90 Keycloak tables sitting in `public`. Prisma sees
    # them as foreign and refuses to continue rather than dropping them.
    if grep -q 'You are about to drop' "$LOG_DIR/db-push.log"; then
        die "The database contains tables Prisma does not manage.
   This usually means the postgres volume predates Keycloak getting its own
   database. Recreate it (this deletes local demo data only):
     ./scripts/stop-demo.sh --clean && ./scripts/start-demo.sh"
    fi
    tail -20 "$LOG_DIR/db-push.log" >&2
    die "Failed to apply the database schema. Full log: $LOG_DIR/db-push.log"
fi
ok "Schema in sync ($(grep -c '^model ' services/shared/prisma/schema.prisma) models)"

docker compose exec -T postgres \
    psql -U "${POSTGRES_USER:-grc}" -d "${POSTGRES_DB:-gigachad_grc}" -v ON_ERROR_STOP=1 \
    < database/dev-bootstrap.sql >/dev/null
ok "Development organization and user present"

# ----------------------------------------------------------------------------
step 5 "Installing and building..."
# ----------------------------------------------------------------------------

if [ ! -d "node_modules" ]; then
    info "Installing workspace dependencies (first run, ~1 minute)..."
    npm install --no-audit --no-fund --silent </dev/null
    ok "Dependencies installed"
else
    ok "Dependencies already installed"
fi

if [ "$SKIP_BUILD" = true ]; then
    warn "Skipping build (--skip-build)"
else
    # services/shared publishes compiled output (main: dist/index.js), so it
    # must be built before anything that imports @gigachad-grc/shared.
    info "Building shared library..."
    npm --prefix services/shared run build </dev/null >"$LOG_DIR/build-shared.log" 2>&1 \
        || die "Failed to build services/shared. See $LOG_DIR/build-shared.log"
    ok "Shared library built"

    info "Building services (parallel)..."
    build_pids=()
    for name in "${SERVICE_NAMES[@]}"; do
        npm --prefix "services/$name" run build </dev/null >"$LOG_DIR/build-$name.log" 2>&1 &
        build_pids+=("$!")
    done
    build_failed=false
    for idx in "${!build_pids[@]}"; do
        wait "${build_pids[$idx]}" || { warn "build failed: ${SERVICE_NAMES[$idx]}"; build_failed=true; }
    done
    [ "$build_failed" = false ] || die "One or more services failed to build. See $LOG_DIR/build-*.log"
    ok "All ${#SERVICE_NAMES[@]} services built"
fi

# ----------------------------------------------------------------------------
step 6 "Starting backend services..."
# ----------------------------------------------------------------------------

for idx in "${!SERVICE_NAMES[@]}"; do
    name="${SERVICE_NAMES[$idx]}"
    port="${SERVICE_PORTS[$idx]}"
    [ -f "services/$name/dist/main.js" ] \
        || die "services/$name is not built. Re-run without --skip-build."
    ( cd "services/$name" && PORT="$port" exec node dist/main ) \
        </dev/null >"$LOG_DIR/$name.log" 2>&1 &
    record_pid "$name" "$!"
done

for idx in "${!SERVICE_NAMES[@]}"; do
    name="${SERVICE_NAMES[$idx]}"
    wait_for_port "${SERVICE_PORTS[$idx]}" "$name" 90 \
        || die "$name failed to start. See $LOG_DIR/$name.log"
done

# ----------------------------------------------------------------------------
step 7 "Loading demo data..."
# ----------------------------------------------------------------------------

if [ "$RUN_SEED" = false ]; then
    warn "Skipping demo data (--no-seed)"
else
    EXISTING="$(curl -fsS http://localhost:3001/api/seed/status 2>/dev/null \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).dataSummary.total))}catch{process.stdout.write("0")}})' \
        2>/dev/null || echo 0)"
    if [ "${EXISTING:-0}" -gt 0 ]; then
        ok "Demo data already present ($EXISTING records)"
    else
        TOTAL="$(curl -fsS -X POST http://localhost:3001/api/seed/load-demo 2>/dev/null \
            | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).totalRecords))}catch{process.stdout.write("")}})' \
            2>/dev/null || echo "")"
        if [ -n "$TOTAL" ]; then
            ok "Loaded $TOTAL demo records"
        else
            warn "Could not load demo data automatically."
            warn "Load it from the UI: Settings → Organization → Demo Data"
        fi
    fi
fi

# ----------------------------------------------------------------------------
step 8 "Starting frontend..."
# ----------------------------------------------------------------------------

# Bind to 127.0.0.1 explicitly: Vite's default binds IPv6 loopback only on
# some systems, which some browsers and curl builds cannot reach. --strictPort
# stops Vite from silently moving to another port, which would break
# Keycloak's redirect URI allow-list.
( cd frontend && exec npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort ) \
    </dev/null >"$LOG_DIR/frontend.log" 2>&1 &
record_pid "frontend" "$!"

wait_for_port "$FRONTEND_PORT" "frontend" 90 \
    || die "Frontend failed to start. See $LOG_DIR/frontend.log"

# ----------------------------------------------------------------------------
# Done
# ----------------------------------------------------------------------------

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   🎉 GigaChad GRC is ready!                                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Open the app:${NC}"
echo "   http://localhost:3000"
echo ""
echo -e "${BLUE}🔐 Sign in:${NC}"
echo "   Click 'Dev Login (Skip SSO)'. No password needed."
echo "   You are signed in as John Doe (admin) of the demo organization."
echo ""
echo -e "${BLUE}🔧 Other endpoints:${NC}"
echo "   Controls API health   http://localhost:3001/api/system/health"
echo "   Keycloak admin        http://localhost:8080  (${KEYCLOAK_ADMIN:-admin} / ${KEYCLOAK_ADMIN_PASSWORD:-admin})"
echo "   MinIO console         http://localhost:9001  (${MINIO_ROOT_USER:-minioadmin} / ${MINIO_ROOT_PASSWORD:-minioadmin})"
echo ""
echo -e "${BLUE}📄 Logs:${NC} .demo/logs/"
echo ""

if [ "$OPEN_BROWSER" = true ]; then
    # Always open localhost, never 127.0.0.1: the Keycloak client in
    # auth/realm-export.json only allows http://localhost:3000/* as a
    # redirect URI.
    case "${OSTYPE:-}" in
        darwin*)          open "http://localhost:3000" 2>/dev/null || true ;;
        linux*)           command -v xdg-open >/dev/null && (xdg-open "http://localhost:3000" >/dev/null 2>&1 &) || true ;;
        msys*|cygwin*)    start "http://localhost:3000" 2>/dev/null || true ;;
    esac
fi

echo -e "${YELLOW}Running. Press Ctrl+C to stop.${NC}"
echo ""

# Wait on all tracked child processes; Ctrl+C is handled by the trap.
wait
