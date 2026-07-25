#!/usr/bin/env bash
# Zero-downtime-ish deploy on EC2. Invoked by GitHub Actions over SSH.
# Expected cwd: application root (e.g. /var/www/budgetbrain-api)
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_SLEEP="${HEALTH_SLEEP:-2}"

cd "$APP_DIR"

echo "==> Deploy started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "==> App dir: $APP_DIR"
echo "==> Branch:  $BRANCH"
node -v
npm -v

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production is missing on the server."
  echo "Create it from .env.example with production secrets before deploying."
  exit 1
fi

# Ensure NODE_ENV is production in the env file (validation + dotenv path)
if ! grep -q '^NODE_ENV=production' .env.production; then
  echo "ERROR: .env.production must set NODE_ENV=production"
  exit 1
fi

echo "==> Fetching latest code"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/${BRANCH}"

echo "==> Installing dependencies"
npm ci

echo "==> Building TypeScript"
npm run build

echo "==> Running database migrate"
NODE_ENV=production npm run db:migrate:prod

echo "==> Reloading PM2 processes"
if pm2 describe budgetbrain-mobile >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

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
  return 1
}

echo "==> Health checks"
health_check "${PORT_MOBILE:-3001}" "mobile"
health_check "${PORT_WEB:-3002}" "web"
health_check "${PORT_ADMIN:-3003}" "admin"

echo "==> Deploy finished successfully at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
pm2 status
