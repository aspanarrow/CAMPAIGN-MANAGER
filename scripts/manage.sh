#!/usr/bin/env bash
#
# ============================================================================
#  Glowify Marketing AI — one-stop manager
# ============================================================================
#  One command to start / stop / check everything.
#
#    ./scripts/manage.sh start      Start backend + frontend (dev)
#    ./scripts/manage.sh stop       Stop backend + frontend
#    ./scripts/manage.sh restart    Restart both
#    ./scripts/manage.sh status     Show what is running + token health
#    ./scripts/manage.sh logs       Tail both logs
#    ./scripts/manage.sh doctor     Check prerequisites (DB, Redis, env, tokens)
#    ./scripts/manage.sh token      Refresh the Shopify 24h token
#    ./scripts/manage.sh meta       Reconnect Meta (opens OAuth helper)
#
#  Requires: Node 18+, PostgreSQL, Redis.
# ============================================================================

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_PORT=5001
FRONTEND_PORT=3000
LOG_DIR="$ROOT/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
WORKER_LOG="$LOG_DIR/worker.log"
SCHEDULER_LOG="$LOG_DIR/scheduler.log"
mkdir -p "$LOG_DIR"

# ---- pretty helpers --------------------------------------------------------
c()   { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
ok()  { c "32" "  ✓ $1"; }
warn(){ c "33" "  ⚠ $1"; }
err() { c "31" "  ✗ $1"; }
info(){ c "36" "  ℹ $1"; }
hdr() { echo ""; c "1;36" "  $1"; echo "  ────────────────────────────────────────────"; }

port_pid() { lsof -ti :"$1" 2>/dev/null | head -1; }
proc_pid() { pgrep -f "$1" 2>/dev/null | head -1; }

is_up() {
  local url="$1"
  curl -s -o /dev/null --max-time 2 "$url" 2>/dev/null
}

# ---- commands --------------------------------------------------------------

cmd_status() {
  hdr "Status"

  local bp fp fp_port
  bp="$(port_pid $BACKEND_PORT)"
  fp="$(port_pid $FRONTEND_PORT)"
  fp_port=$FRONTEND_PORT
  # Next.js falls back to 3001 if 3000 is taken — detect it.
  if [ -z "$fp" ] && [ -n "$(port_pid 3001)" ]; then fp="$(port_pid 3001)"; fp_port=3001; fi

  if [ -n "$bp" ] && is_up "http://localhost:$BACKEND_PORT/health"; then
    ok "Backend   http://localhost:$BACKEND_PORT  (pid $bp)"
  elif [ -n "$bp" ]; then
    warn "Backend port $BACKEND_PORT busy (pid $bp) but not responding"
  else
    err "Backend   not running"
  fi

  if [ -n "$fp" ]; then
    ok "Frontend  http://localhost:$fp_port  (pid $fp)"
  else
    err "Frontend  not running"
  fi

  # PostgreSQL / Redis
  if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then ok "PostgreSQL  up"; else err "PostgreSQL down"; fi
  if redis-cli ping >/dev/null 2>&1; then ok "Redis       up"; else err "Redis       down"; fi

  # Background jobs
  local wp sp
  wp="$(proc_pid 'workers/index.ts')"
  sp="$(proc_pid 'workers/scheduler.ts')"
  if [ -n "$wp" ]; then ok "Worker      running (pid $wp)"; else warn "Worker      not running (metrics won't sync)"; fi
  if [ -n "$sp" ]; then ok "Scheduler   running (pid $sp)"; else warn "Scheduler   not running (cron jobs won't fire)"; fi

  # Shopify token age
  if [ -f "$ROOT/scripts/shopify-auth/index.js" ]; then
    echo ""
    node "$ROOT/scripts/shopify-auth/index.js" --status 2>/dev/null | sed 's/^/  /'
  fi
}

cmd_doctor() {
  hdr "Doctor — prerequisites"

  # Node
  if command -v node >/dev/null 2>&1; then ok "node $(node -v)"; else err "node not found"; fi

  # deps (npm workspace hoists node_modules to the repo root)
  [ -d "$ROOT/node_modules" ] && ok "dependencies installed" || warn "node_modules missing — run: npm install"
  [ -f "$ROOT/node_modules/.bin/tsx" ] && ok "tsx available" || warn "tsx missing — run: npm install"

  # env
  if [ -f "$ROOT/backend/.env" ]; then ok "backend/.env present"; else err "backend/.env MISSING"; fi

  # required env keys (non-placeholder)
  local missing=()
  for k in DATABASE_URL API_KEY SHOPIFY_STORE_URL SHOPIFY_API_KEY SHOPIFY_API_SECRET SHOPIFY_ACCESS_TOKEN; do
    v="$(grep -E "^${k}=" "$ROOT/backend/.env" 2>/dev/null | head -1 | cut -d= -f2-)"
    if [ -z "$v" ] || [[ "$v" == your* ]] || [[ "$v" == *placeholder* ]]; then missing+=("$k"); fi
  done
  if [ ${#missing[@]} -eq 0 ]; then ok "required env vars set"; else err "env missing/placeholder: ${missing[*]}"; fi

  # AI provider
  local ai; ai="$(grep -E '^AI_PROVIDER=' "$ROOT/backend/.env" 2>/dev/null | cut -d= -f2-)"
  ai="${ai:-opencode}"
  if [ "$ai" = "opencode" ]; then
    grep -q '^OPENCODE_API_KEY=oc_sk_' "$ROOT/backend/.env" 2>/dev/null && ok "AI: OpenCode key set" || warn "AI: OPENCODE_API_KEY looks missing"
  else
    grep -q '^GEMINI_API_KEY=' "$ROOT/backend/.env" 2>/dev/null && ok "AI: Gemini key set" || warn "AI: GEMINI_API_KEY missing"
  fi

  # services
  pg_isready -h localhost -p 5432 >/dev/null 2>&1 && ok "PostgreSQL up" || err "PostgreSQL down (start it first)"
  redis-cli ping >/dev/null 2>&1 && ok "Redis up" || err "Redis down (start it first)"

  # DB reachable
  if (cd "$ROOT/backend" && npx prisma migrate status >/dev/null 2>&1); then ok "database reachable + migrated"; else warn "could not verify DB migrations"; fi

  echo ""
  info "If everything is ✓, run:  ./scripts/manage.sh start"
}

cmd_start() {
  hdr "Starting Glowify"

  if [ -n "$(port_pid $BACKEND_PORT)" ]; then warn "backend already running on $BACKEND_PORT"; else
    ok "starting backend → $BACKEND_LOG"
    ( cd "$ROOT/backend" && nohup npm run dev >"$BACKEND_LOG" 2>&1 & )
  fi

  if [ -n "$(port_pid $FRONTEND_PORT)" ]; then warn "frontend already running on $FRONTEND_PORT"; else
    ok "starting frontend → $FRONTEND_LOG"
    ( cd "$ROOT/frontend" && nohup npm run dev >"$FRONTEND_LOG" 2>&1 & )
  fi

  # Background jobs (metrics sync + rules + scheduler)
  if [ -n "$(proc_pid 'workers/index.ts')" ]; then warn "worker already running"; else
    ok "starting worker → $WORKER_LOG"
    ( cd "$ROOT/backend" && nohup npm run worker >"$WORKER_LOG" 2>&1 & )
  fi
  if [ -n "$(proc_pid 'workers/scheduler.ts')" ]; then warn "scheduler already running"; else
    ok "starting scheduler → $SCHEDULER_LOG"
    ( cd "$ROOT/backend" && nohup npm run scheduler >"$SCHEDULER_LOG" 2>&1 & )
  fi

  echo ""
  info "waiting for services..."
  for i in $(seq 1 20); do
    is_up "http://localhost:$BACKEND_PORT/health" && break
    sleep 1
  done

  cmd_status
  echo ""
  ok "Backend  → http://localhost:$BACKEND_PORT"
  ok "Frontend → http://localhost:$FRONTEND_PORT"
  ok "Worker   → metrics sync + rules"
  ok "Scheduler→ cron (30m sync, 2am rules, 1h approvals)"
}

cmd_stop() {
  hdr "Stopping Glowify"
  for p in $BACKEND_PORT $FRONTEND_PORT 3001; do
    local pid; pid="$(port_pid $p)"
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null && ok "stopped pid $pid (port $p)"
      sleep 1
      [ -n "$(port_pid $p)" ] && { kill -9 "$(port_pid $p)" 2>/dev/null; ok "force-stopped port $p"; }
    else
      info "port $p already free"
    fi
  done

  # Background jobs (match by tsx process name)
  for job in 'workers/index.ts' 'workers/scheduler.ts'; do
    local pids; pids="$(pgrep -f "$job" 2>/dev/null)"
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill 2>/dev/null && ok "stopped $job"
    fi
  done
}

cmd_restart() { cmd_stop; sleep 2; cmd_start; }

cmd_logs() {
  hdr "Logs (Ctrl+C to exit)"
  tail -n 40 -f "$BACKEND_LOG" "$FRONTEND_LOG" "$WORKER_LOG" "$SCHEDULER_LOG" 2>/dev/null
}

cmd_token() {
  hdr "Refreshing Shopify token"
  node "$ROOT/scripts/shopify-auth/index.js"
  echo ""
  warn "Backend must restart to pick up the new token."
  read -r -p "  Restart backend now? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] && cmd_restart
}

cmd_meta() {
  hdr "Meta OAuth helper"
  info "Open http://localhost:5555/ in your browser, then Ctrl+C here when done."
  node "$ROOT/scripts/meta-oauth/index.js"
}

usage() {
  cat <<EOF

  Glowify Marketing AI — manager

    ./scripts/manage.sh <command>

  Commands:
    start      Start backend + frontend
    stop       Stop backend + frontend
    restart    Restart both
    status     Show running services + token health
    logs       Tail logs
    doctor     Check prerequisites & env
    token      Refresh the Shopify 24h access token
    meta       Reconnect Meta (OAuth helper)

EOF
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  doctor)  cmd_doctor ;;
  token)   cmd_token ;;
  meta)    cmd_meta ;;
  *)       usage ;;
esac
