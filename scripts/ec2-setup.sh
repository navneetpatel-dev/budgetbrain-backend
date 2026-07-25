#!/usr/bin/env bash
# One-time EC2 bootstrap for BudgetBrain backend.
# Run as ubuntu (or ec2-user) with sudo where needed:
#   curl -fsSL ... | bash   OR   bash scripts/ec2-setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/budgetbrain-api}"
APP_USER="${APP_USER:-$USER}"
NODE_MAJOR="${NODE_MAJOR:-20}"
REPO_URL="${REPO_URL:-https://github.com/navneetpatel-dev/budgetbrain-backend.git}"
BRANCH="${BRANCH:-main}"

echo "==> Updating system packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y curl git build-essential nginx ufw ca-certificates

echo "==> Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" != "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Creating app directory: ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "==> Cloning repository"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  echo "==> Repo already present at ${APP_DIR}"
fi

mkdir -p "${APP_DIR}/logs" "${APP_DIR}/uploads"

if [[ ! -f "${APP_DIR}/.env.production" ]]; then
  echo "==> Creating .env.production from example — EDIT SECRETS BEFORE FIRST START"
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env.production"
  # Force production defaults that validation requires
  sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "${APP_DIR}/.env.production"
  sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://your-web-app.example.com,https://your-admin.example.com|' "${APP_DIR}/.env.production"
  echo "WARNING: Edit ${APP_DIR}/.env.production with real DB/JWT/CORS values before deploy."
fi

echo "==> Configuring UFW (SSH + HTTP/HTTPS only)"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable || true

echo "==> Installing nginx site (if present in repo)"
if [[ -f "${APP_DIR}/deploy/nginx/budgetbrain-api.conf" ]]; then
  sudo cp "${APP_DIR}/deploy/nginx/budgetbrain-api.conf" /etc/nginx/sites-available/budgetbrain-api
  sudo ln -sf /etc/nginx/sites-available/budgetbrain-api /etc/nginx/sites-enabled/budgetbrain-api
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl enable nginx
  sudo systemctl reload nginx
fi

echo "==> Enabling PM2 startup on reboot"
sudo env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "$(eval echo ~"$APP_USER")" | tail -n 1 | bash || true

cat <<EOF

========================================
EC2 setup complete.
Next steps (manual):
  1. Edit secrets:  nano ${APP_DIR}/.env.production
  2. Ensure PostgreSQL is reachable (RDS or local)
  3. Point DNS A records to this EC2 public IP
  4. (Optional) sudo certbot --nginx -d api-mobile.example.com -d api-web.example.com -d api-admin.example.com
  5. First deploy:
       cd ${APP_DIR}
       npm ci
       npm run build
       NODE_ENV=production npm run db:migrate:prod
       pm2 start ecosystem.config.cjs
       pm2 save
  6. Add GitHub Actions secrets (see DEPLOY.md)
========================================
EOF
