# ExpenseFlow API

Node.js + Express + TypeScript REST API for the ExpenseFlow expense tracking platform.

**Related repos:** [expenseflow-mobile](https://github.com/your-org/expenseflow-mobile) · [expenseflow-admin](https://github.com/your-org/expenseflow-admin)

## Stack

- Node.js, Express, TypeScript
- PostgreSQL, Sequelize ORM
- JWT auth, AWS S3, Nodemailer, OpenAI (optional)

## Quick start

```bash
# 1. Start PostgreSQL
docker compose up postgres -d

# 2. Install & configure
cp .env.example .env
npm install

# 3. Seed dev admin user
npm run db:seed

# 4. Run API
npm run dev
```

- API: `http://localhost:3000/api/v1`
- Health: `GET http://localhost:3000/health`

### Dev admin credentials (after seed)

| Email | Password |
|-------|----------|
| `admin@expenseflow.app` | `Admin123!` |

## Docker (API + Postgres)

```bash
docker compose up --build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm run db:seed` | Create dev admin user |

## Environment

See `.env.example` for all variables. Required:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (min 32 chars)
- Database connection (`DB_*` or `DATABASE_URL`)

## API modules

`/api/v1/auth` · `/users` · `/expenses` · `/income` · `/categories` · `/budgets` · `/goals` · `/reports` · `/subscriptions` · `/notifications` · `/family` · `/ai` · `/admin` · `/sync` · `/accounts` · `/investments` · `/net-worth` · `/integrations`

## CORS

Set `CORS_ORIGIN` to your admin and mobile origins in production, e.g.:

```
CORS_ORIGIN=http://localhost:5173,http://localhost:8081
```
