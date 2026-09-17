#!/usr/bin/env bash
# Zero-downtime-ish deploy on EC2. Invoked by GitHub Actions over SSH.
# Expected cwd: application root (e.g. /var/www/budgetbrain-api)
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_SLEEP="${HEALTH_SLEEP:-2}"

# Non-interactive SSH shells often miss nvm / global npm bins
export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.nvm/versions/node/$(ls "${HOME}/.nvm/versions/node" 2>/dev/null | tail -1)/bin:${PATH}"
hash -r || true

cd "$APP_DIR"

echo "==> Deploy started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "==> App dir: $APP_DIR"
echo "==> Branch:  $BRANCH"
command -v node
command -v npm
node -v
npm -v

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production is missing on the server."
  echo "Create it from .env.example with production secrets before deploying."
  exit 1
fi

if ! grep -q '^NODE_ENV=production' .env.production; then
  echo "ERROR: .env.production must set NODE_ENV=production"
  exit 1
fi

echo "==> Fetching latest code"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "==> Installing dependencies (including tsx for migrate)"
# Force include devDeps even if the server has NODE_ENV=production in the environment
npm ci --include=dev

echo "==> Building TypeScript"
npm run build

echo "==> Running database migrate"
NODE_ENV=production npm run db:migrate:prod

PM2_BIN="$(command -v pm2 || true)"
if [[ -z "$PM2_BIN" ]]; then
  PM2_BIN="$(npm prefix -g)/bin/pm2"
fi
if [[ ! -x "$PM2_BIN" ]]; then
  echo "ERROR: pm2 not found. Run: sudo npm install -g pm2"
  exit 1
fi

echo "==> Reloading PM2 processes"
if "$PM2_BIN" describe budgetbrain-mobile >/dev/null 2>&1; then
  "$PM2_BIN" reload ecosystem.config.cjs --update-env
else
  "$PM2_BIN" start ecosystem.config.cjs
fi
"$PM2_BIN" save

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
