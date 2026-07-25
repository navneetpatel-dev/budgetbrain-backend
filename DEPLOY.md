# Deploy BudgetBrain Backend to AWS EC2 (CI/CD)

This guide sets up **error-resistant** deploys: GitHub Actions builds on every push to `main`, then SSHs into EC2 and runs `scripts/deploy.sh` (pull → install → build → migrate → PM2 reload → health checks).

## Architecture

| Service | Port | Public URL (nginx) |
|---------|------|--------------------|
| Mobile API | 3001 | `https://api-mobile.yourdomain.com` |
| Web API | 3002 | `https://api-web.yourdomain.com` |
| Admin API | 3003 | `https://api-admin.yourdomain.com` |

Process manager: **PM2** (`ecosystem.config.cjs`)  
Reverse proxy: **Nginx** (`deploy/nginx/budgetbrain-api.conf`)  
Database: **PostgreSQL** (prefer **AWS RDS** in the same VPC/region)

---

## 1. AWS prerequisites

1. Create an **EC2** instance (Ubuntu 22.04/24.04, t3.small+).
2. Security group inbound:
   - **22** from your IP (SSH)
   - **80 / 443** from `0.0.0.0/0` (HTTP/HTTPS)
   - Do **not** open 3001–3003 publicly
3. Create **RDS PostgreSQL** (or install Postgres on the same box for testing).
4. RDS security group: allow **5432** from the EC2 security group only.
5. Allocate an Elastic IP and attach it to the instance.
6. Point DNS A records:
   - `api-mobile.yourdomain.com` → Elastic IP
   - `api-web.yourdomain.com` → Elastic IP
   - `api-admin.yourdomain.com` → Elastic IP

---

## 2. One-time EC2 setup

SSH into the instance, then:

```bash
# Clone once (public repo) OR use a deploy key for private repos
sudo mkdir -p /var/www
sudo chown "$USER:$USER" /var/www
git clone -b main https://github.com/navneetpatel-dev/budgetbrain-backend.git /var/www/budgetbrain-api
cd /var/www/budgetbrain-api

# Bootstrap Node, PM2, nginx, firewall
bash scripts/ec2-setup.sh
```

### Private GitHub repo

On EC2, create a read-only deploy key and add it in GitHub → **Settings → Deploy keys**:

```bash
ssh-keygen -t ed25519 -C "ec2-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
# Add public key in GitHub Deploy keys (read-only)

cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config ~/.ssh/github_deploy

cd /var/www/budgetbrain-api
git remote set-url origin git@github.com:navneetpatel-dev/budgetbrain-backend.git
git fetch origin
```

### Production env file (required)

```bash
nano /var/www/budgetbrain-api/.env.production
```

Minimum required for a successful start:

```env
NODE_ENV=production
PORT_MOBILE=3001
PORT_WEB=3002
PORT_ADMIN=3003
API_VERSION=v1

DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=5432
DB_NAME=budgetbrain
DB_USER=budgetbrain
DB_PASSWORD=use-a-strong-password

JWT_ACCESS_SECRET=generate-a-long-random-string-min-32-chars
JWT_REFRESH_SECRET=generate-another-long-random-string-min-32

# Must NOT be *
CORS_ORIGIN=https://app.yourdomain.com,https://admin.yourdomain.com

APP_URL=https://app.yourdomain.com

# Recommended
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=budgetbrain-receipts
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=BudgetBrain <noreply@yourdomain.com>
```

Generate secrets:

```bash
openssl rand -base64 48
```

### First manual start (once)

```bash
cd /var/www/budgetbrain-api
npm ci
npm run build
NODE_ENV=production npm run db:migrate:prod
pm2 start ecosystem.config.cjs
pm2 save
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3002/health
curl -s http://127.0.0.1:3003/health
```

### Nginx + HTTPS

1. Edit hostnames in `/etc/nginx/sites-available/budgetbrain-api` (copied from `deploy/nginx/budgetbrain-api.conf`).
2. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`
3. Install Certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx \
  -d api-mobile.yourdomain.com \
  -d api-web.yourdomain.com \
  -d api-admin.yourdomain.com
```

---

## 3. GitHub Actions secrets (CI/CD)

In the **backend** GitHub repo → **Settings → Secrets and variables → Actions**, create:

| Secret | Example | Required |
|--------|---------|----------|
| `EC2_HOST` | `3.110.x.x` or Elastic IP | Yes |
| `EC2_USER` | `ubuntu` | Yes |
| `EC2_SSH_KEY` | Full private key PEM (`-----BEGIN ...`) | Yes |
| `EC2_PORT` | `22` | Optional (defaults to 22) |
| `EC2_APP_DIR` | `/var/www/budgetbrain-api` | Optional |

### Create the deploy SSH key pair (on your laptop)

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./bb-ec2-deploy -N ""
```

- Add **public** key to EC2 `~/.ssh/authorized_keys`
- Paste **private** key contents into GitHub secret `EC2_SSH_KEY`

Test from your machine:

```bash
ssh -i ./bb-ec2-deploy ubuntu@YOUR_EC2_IP 'cd /var/www/budgetbrain-api && bash scripts/deploy.sh'
```

---

## 4. How CI/CD works after setup

1. Push to `main` (or run **Deploy to EC2** → **Run workflow**).
2. Workflow `.github/workflows/ci.yml` / `deploy.yml`:
   - `npm ci` + `npm run build` on GitHub
   - SSH into EC2
   - Run `scripts/deploy.sh`:
     - `git reset --hard origin/main`
     - `npm ci` + `npm run build`
     - `npm run db:migrate:prod`
     - `pm2 reload`
     - Hit `/health` on ports 3001–3003

If health checks fail, the job fails and PM2 logs remain on the server:

```bash
pm2 logs
pm2 status
```

---

## 5. Client base URLs

Point each client at its API host (HTTPS):

- Mobile → `https://api-mobile.yourdomain.com/api/v1`
- Web → `https://api-web.yourdomain.com/api/v1`
- Admin → `https://api-admin.yourdomain.com/api/v1`

---

## 6. Common failures (and fixes)

| Symptom | Fix |
|---------|-----|
| Deploy: missing `.env.production` | Create it on the server (never commit it) |
| App crash: insecure JWT / `CORS_ORIGIN=*` | Set real secrets and explicit CORS origins |
| Migrate / DB errors | Check RDS SG, `DB_*` values, SSL (non-localhost uses SSL) |
| GitHub cannot SSH | Wrong `EC2_SSH_KEY`, user, or security group port 22 |
| EC2 `git fetch` fails | Add deploy key for private repos |
| Health check timeout | `pm2 logs`; confirm build output under `dist/` |
| 502 from nginx | APIs not up; `pm2 restart all` |

---

## 7. Useful commands on EC2

```bash
pm2 status
pm2 logs budgetbrain-web --lines 100
pm2 reload ecosystem.config.cjs --update-env
sudo nginx -t && sudo systemctl reload nginx
bash /var/www/budgetbrain-api/scripts/deploy.sh
```

---

## Files added for deployment

| Path | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Build on push/PR |
| `.github/workflows/deploy.yml` | Deploy to EC2 on `main` |
| `ecosystem.config.cjs` | PM2 apps (mobile/web/admin) |
| `scripts/ec2-setup.sh` | One-time server bootstrap |
| `scripts/deploy.sh` | Idempotent deploy + health checks |
| `deploy/nginx/budgetbrain-api.conf` | Nginx reverse proxy |
| `.nvmrc` | Node 20 for CI and local |
