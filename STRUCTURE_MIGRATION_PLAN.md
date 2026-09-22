# Backend Structure Migration Plan

**Authoritative source:** `structure/backend/BACKEND-STRUCTURE-CONVENTIONS.md`
**Scope note:** This backend is intentionally **three separate Express apps** sharing one repo — `src/mobile/`, `src/web/`, `src/admin/` (own `app.ts` + `routes.ts` + `index.ts`, run concurrently on ports 3001/3002/3003 per `package.json`'s `dev` script and root `README.md`). **Do not collapse them into one app.** This plan reconciles that permanent three-app shape with the convention doc's `core/` / `modules/` / flat-file rules rather than replacing the architecture. `src/shared/modules/<domain>/` is this project's realization of the doc's `modules/<domain>/` layer (shared business logic across all three apps); each app's `features/<domain>/{route,controller}` are the thin per-app HTTP adapters over it.

---

## Compliance summary

| Rule area | Status | Evidence |
|---|---|---|
| `database/` shape (config, migrations, models, seeders) | Compliant | One model/table, `models/index.ts` aggregator, timestamped kebab migrations in order |
| Domain business logic in `modules/`-equivalent | Compliant | `src/shared/modules/<domain>/` holds service+validator+types for all 23 domains |
| `core/` — domain-agnostic, cross-app engines | **Non-compliant** | Does not exist. `errors.ts`, `jwt.ts`, `s3/email/audit.service.ts`, `env/database/production/sentry.ts`, `auth/rateLimit/upload/validate` middleware are triplicated verbatim across `src/{mobile,web,admin}/shared/` |
| Central permissions file | **Non-compliant** | Zero hits for "permission" under `src/`; role checks are inline (`req.user.role === 'admin'`) in middleware/controllers |
| Flat-vs-subfolder rule (doc §2) for per-app route/controller | **Non-compliant** | 20+ of 22 mobile feature modules have exactly 1 file in `route/` and `controller/` — doc requires flat `<domain>.routes.ts` at module root in that case |
| Flat-vs-subfolder rule for `shared/modules/*/service|validator|types` | **Partially compliant** | Most domains have 1 file per layer (should be flat); `auth`, `ai`, `budgets`, `categories`, `integrations`, `notifications`, `recurring`, `reports`, `sync` have 2+ files (subfolder correctly justified) |
| One module already matches doc exactly | Compliant (reference case) | `src/shared/modules/currency/{currency.controller.ts, currency.routes.ts}` — flat, correctly suffixed, no subfolder |
| Controller layer purity (no direct model queries) | **Non-compliant (isolated)** | `src/mobile/features/expenses/controller/attachments.controller.ts` calls `TransactionAttachment.update(...)` directly — bypasses the service/module layer |
| Error class hierarchy | Compliant | 28 files use `AppError`; zero raw `throw new Error(...)` in `features/`/`modules/` |
| `config/` — one file per external system | **Non-compliant** | Doc wants db/redis/queue/storage/mail/payments each as one file; only `env.ts` exists at `src/config/`, while db/production/sentry config is triplicated per-app instead |
| `jobs/` — pure logic vs processor split | **Non-compliant** | No `jobs/` directory exists; scheduling logic lives inside `src/shared/modules/notifications/service/scheduledJobs.service.ts`, mixing schedule wiring and job logic in one file |
| Dead/empty route files | Finding | `src/mobile/features/dashboard/route/index.ts` is an empty stub (`const router = Router(); export default router;`) — dashboard is apparently not exposing routes through this file; verify it isn't dead code |

---

## Findings (priority order)

### 1. Triplicated cross-app infrastructure has no `core/` home
`src/mobile/shared/`, `src/web/shared/`, `src/admin/shared/` each contain byte-identical (or near-identical) copies of:
- `services/s3.service.ts`, `services/email.service.ts`, `services/audit.service.ts` — **identical across all three apps**
- `config/database.ts`, `config/production.ts`, `config/sentry.ts` — **identical**
- `config/env.ts` — identical except a stray comment in `admin`
- `middleware/rateLimit.ts`, `middleware/upload.ts`, `middleware/validate.ts` — **identical**
- `utils/jwt.ts` — identical; `utils/errors.ts` — identical except a per-app `createLogger('mobile'|'web'|'admin')` string
- `middleware/auth.ts` — **genuinely diverges**: `admin`'s version drops the mobile/web `requireOnboarding` export and hardcodes `setAuditActor(user.id, 'admin')` instead of a role-conditional. This one is a real per-app variant, not accidental drift.

Doc §3: "Genuinely cross-domain, domain-agnostic engines → `core/`." Doc §8: "No duplicate implementations... one source of truth." There is no `src/core/` at all. This is the single biggest gap.

**Fix:** create `src/core/` and move every byte-identical file there once (parameterize the app-name string where one exists, e.g. `createLogger(appName)`); keep `auth.ts`'s genuinely divergent `requireOnboarding`/audit-actor behavior as a small per-app override that composes the shared `core/auth` primitive rather than forking the whole file.

### 2. No central permissions file
Doc §12: "Every permission string key lives in the central permissions file, mapped to roles in that same place." Today, role gating is inline (`req.user.role === 'admin'`) inside `src/{mobile,web,admin}/shared/middleware/auth.ts`, and entitlement gating is a separate ad hoc middleware (`@shared/middleware/requireEntitlement`). There is no single source of truth for permission keys → role mapping.

**Fix:** introduce `src/core/permissions/permissions.ts` exporting named permission keys and a `hasPermission(role, key)` helper; refactor `auth.ts`'s inline role checks and `requireEntitlement` to read from it.

### 3. Per-app route/controller folders that hold exactly one file
Doc §2: "one file for a concern → flat; two or more files for the same functionality → subfolder named after that functionality." Verified file counts in `src/mobile/features/*/{route,controller}`:

| Domain | route/ files | controller/ files |
|---|---|---|
| accounts, ai, auth, budgets, categories, dashboard, family, goals, income, integrations, investments, loans, net-worth, notifications, recurring, reports, search, subscriptions, support, sync, users | 1 | 1 |
| expenses | 2 (`index.ts`, `attachments.routes.ts`) | 2 (`expenses.controller.ts`, `attachments.controller.ts`) |

20 of 22 mobile modules qualify for flattening; `expenses` correctly keeps its subfolder (2 files) but should rename `route/index.ts` → `route/expenses.routes.ts` for symmetry with `attachments.routes.ts` (an unnamed `index.ts` sitting next to a named sibling is inconsistent). The reference-correct module is `src/shared/modules/currency/` — flat, `currency.controller.ts` + `currency.routes.ts`, no subfolder. Apply the same flat pattern to every single-file module in `src/{mobile,web,admin}/features/*/`.

**Fix pattern per single-file module:** `features/<domain>/route/index.ts` → `features/<domain>/<domain>.routes.ts`; `features/<domain>/controller/<domain>.controller.ts` → `features/<domain>/<domain>.controller.ts`; delete the now-empty `route/`/`controller/` folders; update the two import sites (the app's `routes.ts` aggregator, and the route file's own controller import).

### 4. Same flat-vs-subfolder rule applies inside `shared/modules/`
Counted file totals per domain in `src/shared/modules/<domain>/{service,validator,types}`:

- **1 file per layer (flatten to `<domain>.service.ts` / `<domain>.validator.ts` / `<domain>.types.ts` at module root):** accounts, dashboard, expenses, family, goals, income, investments, loans, net-worth, support, users, and the `validator`/`types` layers of every domain listed below.
- **2+ files (subfolder already justified by doc §2 — leave as a folder, but confirm naming is `<file>.service.ts` per file, not `index.ts`):** `auth/service` (5 files), `notifications/service` (3), `reports/service` (3), `ai/service`, `budgets/service`, `categories/service`, `integrations/service`, `recurring/service`, `sync/validator` (2 each).
- `currency` is the exception already flat at the module root with no subfolder at all — this is the target shape for every "1 file" row above.

**Fix:** for every domain where a layer folder holds exactly one file, flatten it the same way as finding 3.

### 5. Controller layer purity violation
`src/mobile/features/expenses/controller/attachments.controller.ts` imports `Transaction`, `TransactionAttachment` directly from `@database/models` and calls `TransactionAttachment.update(...)` inside `scheduleReceiptExtraction`. Doc's controller row forbids "Sequelize queries" in `.controller.ts`. This bypasses `src/shared/modules/expenses/` entirely for this write path.

**Fix:** move `scheduleReceiptExtraction` (and any other direct-model calls in this file) into `src/shared/modules/expenses/service/attachments.service.ts` (new file, since expenses already has 2+ files justifying a subfolder), exposing a service function the controller calls instead.

### 6. `config/` is not one-file-per-external-system
Doc §3/§7: "External systems → `src/config/`. One file per infra concern... do not add a parallel config loader." Today `src/config/` has only `env.ts`; `database.ts`, `production.ts`, `sentry.ts` live triplicated inside each app's `shared/config/` instead of once at `src/config/`.

**Fix:** once finding 1's dedup lands, these three files move to `src/config/` alongside `env.ts` (they're already app-agnostic per the diff results), leaving each app's own `shared/config/` empty and removable.

### 7. `jobs/` split doesn't exist
Doc §7: jobs split pure logic (`<thing>.ts`) from worker wiring (`<thing>.processor.ts`), aggregated by `jobs/index.ts`. The only scheduling code found is `src/shared/modules/notifications/service/scheduledJobs.service.ts` — read it before moving anything; if it mixes `setInterval`/cron registration with the actual notification logic in one file, split it.

**Fix:** create `src/jobs/`; extract the pure per-job logic to `src/jobs/<thing>.ts`, keep scheduling/registration in `src/jobs/<thing>.processor.ts`, add `src/jobs/index.ts` as the start/stop aggregator, and have each app's `index.ts` call it if that app needs jobs running.

### 8. Dead route file (verify before touching)
`src/mobile/features/dashboard/route/index.ts` is a no-op stub (`Router()` with nothing mounted). Confirm whether dashboard is actually routeless by design (data pulled via another feature's endpoints) or whether this is an incomplete migration before deciding to delete it as part of finding 3's flattening.

---

## Recommended target shape

```
backend/
  database/                         # unchanged — already compliant
  src/
    core/                           # NEW — deduplicated cross-app engines
      http/errors.ts                # was 3x utils/errors.ts (logger name parameterized)
      auth/
        jwt.ts                      # was 3x utils/jwt.ts
        authenticate.ts             # shared authenticate() from middleware/auth.ts
        requireOnboarding.ts        # mobile/web variant; admin composes without it
      permissions/
        permissions.ts              # NEW — central permission keys -> roles
      middleware/
        rateLimit.ts                # was 3x
        upload.ts                   # was 3x
        validate.ts                 # was 3x
      services/
        s3.service.ts               # was 3x
        email.service.ts            # was 3x
        audit.service.ts            # was 3x
    config/                         # one file per external system (doc §3)
      env.ts                        # already here
      database.ts                   # moved from 3x per-app copies
      production.ts                 # moved from 3x per-app copies
      sentry.ts                     # moved from 3x per-app copies
    jobs/                           # NEW
      scheduledNotifications.ts             # pure logic, extracted
      scheduledNotifications.processor.ts   # cron/interval wiring
      index.ts                              # start/stop aggregator
    shared/
      modules/<domain>/            # unchanged home for business logic; flatten 1-file layers (finding 4)
        <domain>.service.ts        # flattened, e.g. accounts, dashboard, expenses...
        <domain>.validator.ts
        <domain>.types.ts
        service/                   # kept only where 2+ files (auth, ai, budgets, categories, integrations, notifications, recurring, reports, sync)
    mobile/ | web/ | admin/
      app.ts, routes.ts, index.ts  # unchanged
      features/<domain>/
        <domain>.routes.ts         # flattened from route/index.ts (finding 3)
        <domain>.controller.ts     # flattened from controller/<domain>.controller.ts
      shared/                      # shrinks to genuinely app-specific overrides only
```

---

## Step-by-step migration plan

### Phase 1 — Dedup triplicated infra into `src/core/` and `src/config/`
- [ ] Create `src/core/{http,auth,permissions,middleware,services}/`.
- [ ] Move `src/mobile/shared/utils/errors.ts` → `src/core/http/errors.ts`; change `createLogger('mobile')` to `createLogger(appName)` with `appName` passed at each app's call site (or read from `process.env.APP_NAME` set in each app's `index.ts`). Delete the `web`/`admin` copies; update all imports.
- [ ] Move `src/mobile/shared/utils/jwt.ts` → `src/core/auth/jwt.ts`. Delete the other two copies; update imports.
- [ ] Move `src/mobile/shared/middleware/{rateLimit,upload,validate}.ts` → `src/core/middleware/`. Delete the other two copies each; update imports in all three apps' `routes.ts`/feature routes.
- [ ] Move `src/mobile/shared/services/{s3,email,audit}.service.ts` → `src/core/services/`. Delete the other two copies each; update every controller/service that imports them (`attachments.controller.ts` among others).
- [ ] Split `middleware/auth.ts`: move the identical `authenticate` function to `src/core/auth/authenticate.ts`; keep `requireOnboarding` as `src/core/auth/requireOnboarding.ts` (used by mobile+web only); leave admin's divergent audit-actor line as a small local wrapper in `src/admin/shared/middleware/auth.ts` that imports `authenticate` from core and applies its own `setAuditActor` call.
- [ ] Move `config/{database,production,sentry}.ts` from any one app's `shared/config/` → `src/config/`. Delete the other two copies each; update imports across all three apps.
- [ ] Run each app's typecheck (`npm run build` or `tsc --noEmit` per `backend/tsconfig.json`) after each move, not at the end.

### Phase 2 — Central permissions file
- [ ] Create `src/core/permissions/permissions.ts`: enumerate every role check currently inline in `auth.ts` (admin vs user) and every `requireEntitlement('pro')`-style gate found in each app's `routes.ts`, and encode them as named permission keys mapped to roles/entitlements.
- [ ] Refactor `middleware/auth.ts` role checks and `@shared/middleware/requireEntitlement` to call `hasPermission(role, key)` from the new file instead of inline string comparisons.

### Phase 3 — Flatten single-file layer folders
- [ ] For each of the 20 mobile domains listed in Finding 3 (accounts, ai, auth, budgets, categories, dashboard, family, goals, income, integrations, investments, loans, net-worth, notifications, recurring, reports, search, subscriptions, support, sync, users): move `route/index.ts` → `<domain>.routes.ts`, `controller/<domain>.controller.ts` → `<domain>.controller.ts`, delete the empty `route/`/`controller/` folders, fix the two import sites. Repeat identically for `src/web/features/*` (same domain list minus `sync`) and `src/admin/features/{admin,auth}`.
- [ ] Rename `src/mobile/features/expenses/route/index.ts` → `expenses.routes.ts` for naming symmetry with `attachments.routes.ts` (keep the subfolder — 2 files justifies it).
- [ ] For each of the 1-file-per-layer domains in `src/shared/modules/` listed in Finding 4 (accounts, dashboard, expenses, family, goals, income, investments, loans, net-worth, support, users, plus the `validator`/`types` layers of every other domain): flatten `service/<file>.service.ts` → `<domain>.service.ts`, `validator/<file>.ts` → `<domain>.validator.ts`, `types/index.ts` → `<domain>.types.ts` at the module root; delete emptied folders; fix imports (search each domain name across `src/{mobile,web,admin}/features/*/controller/*.ts` for `@shared/modules/<domain>`).
- [ ] Leave `auth`, `ai`, `budgets`, `categories`, `integrations`, `notifications`, `recurring`, `reports`, `sync` service subfolders in place (2+ files, doc-compliant); just confirm each file inside is named `<thing>.service.ts`, not `index.ts`.
- [ ] Verify `src/mobile/features/dashboard/route/index.ts` is truly unused before deleting (grep for any direct import of it beyond the aggregator mount); if it mounts nothing, remove the mount line from `src/mobile/routes.ts` too.

### Phase 4 — Fix the one controller purity violation
- [ ] Add `scheduleReceiptExtraction` (and the `TransactionAttachment.update(...)` call it makes) as a new function in `src/shared/modules/expenses/service/attachments.service.ts`; have `attachments.controller.ts` call that service function instead of importing `@database/models` directly.

### Phase 5 — `jobs/` split
- [ ] Read `src/shared/modules/notifications/service/scheduledJobs.service.ts` in full; identify the scheduling/registration code vs the pure per-run logic.
- [ ] Create `src/jobs/scheduledNotifications.ts` (pure logic) and `src/jobs/scheduledNotifications.processor.ts` (interval/cron registration, imports the pure file), plus `src/jobs/index.ts` exporting `start()`/`stop()`.
- [ ] Update whichever app's `index.ts` currently triggers this scheduling to call `jobs/index.ts`'s `start()` instead of importing the service directly.

### Phase 6 — Verification
- [ ] Run typecheck, lint, and the backend's test runner (`vitest.config.mts`) for all three apps after every phase, not just at the end.
- [ ] Grep the whole `src/` tree for any remaining triplicated filename across `mobile/shared`, `web/shared`, `admin/shared` to confirm Phase 1 left nothing behind.
- [ ] Confirm `npm run dev` still boots all three apps on 3001/3002/3003 and a smoke-test request against `/api/v1/auth` and one protected route (e.g. `/api/v1/expenses`) succeeds on each.

---

## Doc update recommendation

`BACKEND-STRUCTURE-CONVENTIONS.md` currently describes a single-application `src/` tree and never mentions the `mobile/`/`web`/`admin` split, which forces every reader to reverse-engineer this reconciliation from scratch. Recommend adding a short section near the top (after §1's governing hierarchy) along these lines (do not edit the doc from this plan — just add it separately):

> **This backend ships as three independently-deployed Express apps** (`src/mobile/`, `src/web/`, `src/admin/`), each with its own `app.ts`/`routes.ts`/`index.ts` and a `features/<domain>/` folder of thin, app-specific HTTP adapters (`<domain>.routes.ts`, `<domain>.controller.ts`). All three apps share one `modules/` layer at `src/shared/modules/<domain>/` (service, validator/dto, types) and one `core/` layer at `src/core/` (domain-agnostic engines: auth, http errors, permissions, storage, email, audit, rate limiting). A new domain gets a `src/shared/modules/<domain>/` entry plus a thin `features/<domain>/` adapter in whichever app(s) expose it — never a fourth copy of shared infra inside an app's own `shared/` folder.
