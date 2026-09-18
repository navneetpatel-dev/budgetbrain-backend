#!/usr/bin/env bash
# One-time EC2 bootstrap for BudgetBrain backend.
# Supports Ubuntu/Debian and Amazon Linux 2 / 2023 (ec2-user).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/budgetbrain-api}"
APP_USER="${APP_USER:-$USER}"
NODE_MAJOR="${NODE_MAJOR:-20}"
REPO_URL="${REPO_URL:-https://github.com/navneetpatel-dev/budgetbrain-backend.git}"
BRANCH="${BRANCH:-main}"

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

OS_ID="$(detect_os)"
echo "==> Detected OS: ${OS_ID}"

echo "==> Installing system packages"
case "$OS_ID" in
  ubuntu|debian)
    sudo apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
    sudo apt-get install -y curl git build-essential nginx ca-certificates
    if command -v ufw >/dev/null 2>&1; then
      sudo apt-get install -y ufw
    fi
    ;;
  amzn|rhel|centos|fedora)
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf update -y
      sudo dnf install -y curl git gcc gcc-c++ make nginx ca-certificates tar
    else
      sudo yum update -y
      sudo yum install -y curl git gcc gcc-c++ make nginx ca-certificates tar
    fi
    ;;
  *)
    echo "ERROR: Unsupported OS '${OS_ID}'. Install git, nginx, and Node ${NODE_MAJOR} manually."
    exit 1
    ;;
esac

echo "==> Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" != "$NODE_MAJOR" ]]; then
  case "$OS_ID" in
    ubuntu|debian)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
      sudo apt-get install -y nodejs
      ;;
    *)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | sudo bash -
      if command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs
      else
        sudo yum install -y nodejs
      fi
      ;;
  esac
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
  sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' "${APP_DIR}/.env.production"
  sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://your-web-app.example.com,https://your-admin.example.com|' "${APP_DIR}/.env.production"
  echo "WARNING: Edit ${APP_DIR}/.env.production with real DB/JWT/CORS values before deploy."
fi

if command -v ufw >/dev/null 2>&1; then
  echo "==> Configuring UFW (SSH + HTTP/HTTPS only)"
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw --force enable || true
else
  echo "==> Skipping UFW (Amazon Linux). Allow 22/80/443 on the EC2 security group."
fi

echo "==> Installing nginx site (if present in repo)"
NGINX_SRC="${APP_DIR}/deploy/nginx/budgetbrain-api.conf"
if [[ -f "$NGINX_SRC" ]]; then
  sudo mkdir -p /etc/nginx/conf.d /etc/nginx/sites-available /etc/nginx/sites-enabled
  case "$OS_ID" in
    ubuntu|debian)
      sudo cp "$NGINX_SRC" /etc/nginx/sites-available/budgetbrain-api
      sudo ln -sf /etc/nginx/sites-available/budgetbrain-api /etc/nginx/sites-enabled/budgetbrain-api
      sudo rm -f /etc/nginx/sites-enabled/default
      ;;
    *)
      sudo cp "$NGINX_SRC" /etc/nginx/conf.d/budgetbrain-api.conf
      ;;
  esac
  sudo nginx -t
  sudo systemctl enable nginx
  sudo systemctl restart nginx
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
  4. (Optional HTTPS) sudo dnf install -y certbot python3-certbot-nginx
     sudo certbot --nginx -d api-mobile.example.com -d api-web.example.com -d api-admin.example.com
  5. First deploy:
       cd ${APP_DIR}
       npm ci --include=dev
       npm run build
       NODE_ENV=production npm run db:migrate:prod
       pm2 start ecosystem.config.cjs
       pm2 save
  6. GitHub Actions secret EC2_USER must be: ${APP_USER}
========================================
EOF
