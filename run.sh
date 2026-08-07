#!/usr/bin/env bash
# Runs the ASOIAF Family Tree app locally: backend (FastAPI/uvicorn) on
# port 8001, frontend (Vite) on port 5173.
#
#   ./run.sh        kill anything on the app's ports, start both servers
#                    detached, wait for them to come up, open the browser
#   ./run.sh stop    just kill anything on the app's ports
#
# Servers are started detached (setsid + disown) so they keep running after
# this script exits.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.run-logs"
BACKEND_PORT=8001
FRONTEND_PORT=5173

kill_port() {
    local port="$1"
    local pid
    pid=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $NF}' | head -1 || true)
    if [ -n "${pid:-}" ]; then
        echo "Killing PID $pid on port $port"
        taskkill //PID "$pid" //F >/dev/null 2>&1 || true
    fi
}

echo "Stopping anything on ports $BACKEND_PORT and $FRONTEND_PORT..."
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

if [ "${1:-}" = "stop" ]; then
    echo "Stopped. (stop passed, not restarting)"
    exit 0
fi

mkdir -p "$LOG_DIR"

# ── Backend ──────────────────────────────────────────────────────────────
echo
echo "Installing backend dependencies..."
(cd "$BACKEND_DIR" && python -m pip install -r requirements.txt -q)

echo "Starting backend on port $BACKEND_PORT..."
(cd "$BACKEND_DIR" && nohup python -m uvicorn main:app --port "$BACKEND_PORT" \
    >"$LOG_DIR/backend.out.log" 2>"$LOG_DIR/backend.err.log" &
 disown) </dev/null

# ── Frontend ─────────────────────────────────────────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo
    echo "Installing frontend dependencies (first run)..."
    (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting frontend on port $FRONTEND_PORT..."
# --host 127.0.0.1: left to its default, Vite can bind IPv6-only (::1) on
# some machines, which won't match the 127.0.0.1 health check below.
(cd "$FRONTEND_DIR" && nohup npm run dev -- --host 127.0.0.1 \
    >"$LOG_DIR/frontend.out.log" 2>"$LOG_DIR/frontend.err.log" &
 disown) </dev/null

# ── Wait for both to come up ────────────────────────────────────────────
wait_for_http() {
    local url="$1"
    local timeout="${2:-45}"
    local elapsed=0
    while [ "$elapsed" -lt "$timeout" ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -q "200"; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    return 1
}

echo
echo "Waiting for backend..."
if ! wait_for_http "http://127.0.0.1:$BACKEND_PORT/api/people"; then
    echo "Backend did not respond in time. Check $LOG_DIR/backend.err.log"
    exit 1
fi
echo "Backend OK."

echo "Waiting for frontend..."
if ! wait_for_http "http://127.0.0.1:$FRONTEND_PORT"; then
    echo "Frontend did not respond in time. Check $LOG_DIR/frontend.err.log"
    exit 1
fi
echo "Frontend OK."

echo
echo "Family Tree running:"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend:  http://localhost:$BACKEND_PORT"
echo "  API docs: http://localhost:$BACKEND_PORT/docs"
echo
echo "Logs: $LOG_DIR/"
echo "Stop: ./run.sh stop"
echo

start "http://127.0.0.1:$FRONTEND_PORT" >/dev/null 2>&1 || true
