#!/bin/zsh
# =====================================================
# 🔐 EasyKey Dev Launcher (Web + Go, parallel)
# - Startet Go-Auth-API (:8080) und Next.js Web (:3000)
# - Macht Health-Checks und öffnet Browser
# - Sauberes Stoppen via CTRL+C
# =====================================================

set -e

# --- Konfig (Ports anpassbar) -------------------------
API_PORT="${API_PORT:-8080}"
WEB_PORT="${WEB_PORT:-3000}"
WEB_FILTER="@easykey/web"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# --- Flags --------------------------------------------
#   --no-install    : überspringt pnpm install Schritte
#   --no-open       : öffnet keinen Browser
NO_INSTALL=false
NO_OPEN=false
for arg in "$@"; do
  [[ "$arg" == "--no-install" ]] && NO_INSTALL=true
  [[ "$arg" == "--no-open"    ]] && NO_OPEN=true
done

echo "🔧 Root: $ROOT_DIR"
echo "🌐 Web-Port: :$WEB_PORT    🔒 API-Port: :$API_PORT"

# --- Checks -------------------------------------------
if ! command -v go >/dev/null; then
  echo "❌ Go nicht gefunden. Installiere es (brew install go) und starte erneut."
  exit 1
fi

if ! command -v pnpm >/dev/null; then
  echo "❌ pnpm nicht gefunden. Installiere es mit: npm i -g pnpm"
  exit 1
fi

# --- Dependencies (optional) --------------------------
if [ "$NO_INSTALL" = false ]; then
  echo "📦 Installiere Abhängigkeiten (root + workspaces)…"
  pnpm install --no-frozen-lockfile
  pnpm -r install --no-frozen-lockfile
else
  echo "⏭️  Überspringe Installation (--no-install)"
fi

# --- Vorhandene Prozesse auf Ports checken ------------
function kill_on_port() {
  local PORT=$1
  local PID
  PID=$(lsof -ti tcp:"$PORT" || true)
  if [ -n "$PID" ]; then
    echo "⚠️  Port :$PORT belegt (PID: $PID). Beende Prozess…"
    kill "$PID" || true
    sleep 1
  fi
}
kill_on_port "$API_PORT"
kill_on_port "$WEB_PORT"

# --- Go Auth-API starten ------------------------------
echo "🚀 Starte Go Auth-API auf :$API_PORT …"
( cd services/auth-api && GO_PORT=":$API_PORT" go run ./... ) &
AUTH_PID=$!

# Healthcheck API (max 20s)
echo -n "⏳ Warte auf http://localhost:$API_PORT/health "
for i in {1..40}; do
  if curl -fsS "http://localhost:$API_PORT/health" >/dev/null 2>&1; then
    echo "✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

# --- Next.js Web starten ------------------------------
echo "🌐 Starte Web (Next.js) auf :$WEB_PORT …"
# Next.js liest PORT-Env
( PORT="$WEB_PORT" pnpm --filter "$WEB_FILTER" dev ) &
WEB_PID=$!

# Healthcheck Web (max 60s)
echo -n "⏳ Warte auf http://localhost:$WEB_PORT "
for i in {1..120}; do
  if curl -fsS "http://localhost:$WEB_PORT" >/dev/null 2>&1; then
    echo "✅"
    break
  fi
  echo -n "."
  sleep 0.5
done

# --- Cleanup ------------------------------------------
cleanup() {
  echo ""
  echo "🧹 Stoppe Prozesse…"
  kill $WEB_PID $AUTH_PID 2>/dev/null || true
  wait $WEB_PID $AUTH_PID 2>/dev/null || true
  echo "👋 Fertig."
}
trap cleanup EXIT INT TERM

# --- Browser öffnen (macOS) ---------------------------
if [ "$NO_OPEN" = false ] && command -v open >/dev/null; then
  open "http://localhost:$WEB_PORT"
  open "http://localhost:$API_PORT/health"
fi

echo ""
echo "🟢 Läuft!"
echo "   Web: http://localhost:$WEB_PORT"
echo "   API: http://localhost:$API_PORT/health"
echo "⛔ Beenden mit CTRL+C"
wait