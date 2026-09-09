#!/usr/bin/env bash
#
# ============================================================================
# GigaChad GRC - Stop the demo
# ============================================================================
#
# USAGE:
#   ./scripts/stop-demo.sh            Stop host processes and containers
#   ./scripts/stop-demo.sh --clean    ...and delete database/storage volumes
#   ./scripts/stop-demo.sh --purge    ...and also delete .env and built output
#
# --clean drops the PostgreSQL, Redis and MinIO volumes, so the next run
# starts from an empty database and re-seeds demo data.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

RUN_DIR="$PROJECT_ROOT/.demo"
PID_FILE="$RUN_DIR/pids"

CLEAN=false
PURGE=false
for arg in "$@"; do
    case "$arg" in
        --clean) CLEAN=true ;;
        --purge) CLEAN=true; PURGE=true ;;
        -h|--help) sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $arg (try --help)" >&2; exit 1 ;;
    esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok() { echo -e "${GREEN}   ✓ $*${NC}"; }

echo ""
echo -e "${YELLOW}🛑 Stopping GigaChad GRC demo...${NC}"
echo ""

# ----------------------------------------------------------------------------
# Host processes
# ----------------------------------------------------------------------------
# Only PIDs this project recorded are signalled. A blanket `pkill -f vite`
# would also kill unrelated dev servers on the machine.

if [ -f "$PID_FILE" ]; then
    stopped=0
    while read -r name pid; do
        [ -n "${pid:-}" ] || continue
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            stopped=$((stopped + 1))
            echo "   stopped $name (pid $pid)"
        fi
    done < "$PID_FILE"

    # Give them a moment, then force anything still alive.
    sleep 2
    while read -r name pid; do
        [ -n "${pid:-}" ] || continue
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    done < "$PID_FILE"

    rm -f "$PID_FILE"
    ok "Stopped $stopped host process(es)"
else
    ok "No tracked host processes"
fi

# ----------------------------------------------------------------------------
# Containers
# ----------------------------------------------------------------------------

if [ "$CLEAN" = true ]; then
    docker compose down -v --remove-orphans
    ok "Containers and volumes removed"
else
    docker compose down --remove-orphans
    ok "Containers stopped (volumes kept)"
fi

# ----------------------------------------------------------------------------
# Optional purge
# ----------------------------------------------------------------------------

if [ "$PURGE" = true ]; then
    rm -f .env
    rm -rf "$RUN_DIR"
    rm -rf services/*/dist services/shared/dist frontend/node_modules/.vite
    ok "Removed .env, .demo/ and build output"
fi

echo ""
echo "Done. Start again with: ./scripts/start-demo.sh"
echo ""
