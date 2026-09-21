#!/usr/bin/env bash
# Zero-downtime-ish deploy on EC2. Invoked by GitHub Actions over SSH.
# Expected cwd: application root (e.g. /var/www/budgetbrain-api)
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_SLEEP="${HEALTH_SLEEP:-2}"

# Cap Node heap so install/build cannot balloon into the OOM killer (exit 137).
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"

# Non-interactive SSH shells often miss nvm / global npm bins
export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.nvm/versions/node/$(ls "${HOME}/.nvm/versions/node" 2>/dev/null | tail -1)/bin:${PATH}"
hash -r || true

cd "$APP_DIR"

echo "==> Deploy started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "==> App dir: $APP_DIR"
echo "==> Branch:  $BRANCH"
echo "==> SHA:     ${DEPLOY_SHA:-origin/${BRANCH}}"
echo "==> Skip build: $SKIP_BUILD"
command -v node
command -v npm
node -v
npm -v
echo "==> Memory before deploy"
free -m || true
df -h "$APP_DIR" || true

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production is missing on the server."
  echo "Create it from .env.example with production secrets before deploying."
  exit 1
fi

if ! grep -q '^NODE_ENV=production' .env.production; then
  echo "ERROR: .env.production must set NODE_ENV=production"
  exit 1
fi

PM2_BIN="$(command -v pm2 || true)"
if [[ -z "$PM2_BIN" ]]; then
  PM2_BIN="$(npm prefix -g)/bin/pm2"
fi

pm2_running=0
stop_pm2_to_free_ram() {
  if [[ -x "$PM2_BIN" ]] && "$PM2_BIN" describe budgetbrain-mobile >/dev/null 2>&1; then
    echo "==> Stopping PM2 apps to free RAM for install/build"
    pm2_running=1
    "$PM2_BIN" stop all || true
    echo "==> Memory after PM2 stop"
    free -m || true
  fi
}

restart_pm2() {
  if [[ ! -x "$PM2_BIN" ]]; then
    echo "ERROR: pm2 not found. Run: sudo npm install -g pm2"
    return 1
  fi
  if "$PM2_BIN" describe budgetbrain-mobile >/dev/null 2>&1; then
    "$PM2_BIN" restart ecosystem.config.cjs --update-env \
      || "$PM2_BIN" reload ecosystem.config.cjs --update-env \
      || "$PM2_BIN" start ecosystem.config.cjs
  else
    "$PM2_BIN" start ecosystem.config.cjs
  fi
  "$PM2_BIN" save || true
}

# If install/build is killed (SIGKILL 137), bring APIs back up.
trap 'if [[ "$pm2_running" -eq 1 ]]; then echo "==> Restoring PM2 after failure"; restart_pm2 || true; fi' EXIT

echo "==> Fetching latest code"
git fetch --prune origin
git checkout "$BRANCH"
if [[ -n "$DEPLOY_SHA" ]]; then
  git reset --hard "$DEPLOY_SHA"
else
  git reset --hard "origin/${BRANCH}"
fi

stop_pm2_to_free_ram

if [[ "$SKIP_BUILD" == "1" ]]; then
  if [[ ! -f dist/src/mobile/index.js || ! -f dist/src/web/index.js || ! -f dist/src/admin/index.js ]]; then
    echo "ERROR: SKIP_BUILD=1 but compiled dist/ is missing. Upload the GitHub build artifact first."
    exit 1
  fi
  echo "==> Installing production dependencies (no compiler toolchain)"
  npm ci --omit=dev
else
  echo "==> Installing dependencies (including tsx for migrate)"
  npm ci --include=dev
  echo "==> Building TypeScript"
  npm run build
fi

echo "==> Running database migrate"
npm run db:migrate:prod

echo "==> Reloading PM2 processes"
pm2_running=0
trap - EXIT
restart_pm2

health_check() {
  local port="$1"
  local name="$2"
  local i
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      echo "OK  ${name} :${port}/health"
      return 0
    fi
    sleep "$HEALTH_SLEEP"
  done
  echo "FAIL ${name} :${port}/health did not become healthy"
  "$PM2_BIN" logs --lines 40 --nostream || true
  return 1
}

echo "==> Health checks"
health_check "${PORT_MOBILE:-3001}" "mobile"
health_check "${PORT_WEB:-3002}" "web"
health_check "${PORT_ADMIN:-3003}" "admin"

echo "==> Deploy finished successfully at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$PM2_BIN" status
