# Backend — Architecture & Folder Structure

Authoritative shape: `../structure/backend/BACKEND-STRUCTURE-CONVENTIONS.md`, with the three-app architecture and accepted deviations below. This file describes the code as it is.

## Overview

This backend ships as **three independently-deployed Express apps** sharing one repo, plus one shared domain layer and one shared infrastructure core:

```
backend/
├── database/                # shared by all three apps — config, migrations, models, seeders
├── src/
│   ├── core/                 # domain-agnostic engines, used by all three apps
│   │   ├── audit/            # audit.service.ts
│   │   ├── auth/             # jwt.ts, authenticate.ts, requireOnboarding.ts, requireAdmin.ts
│   │   ├── http/             # errors.ts (AppError hierarchy)
│   │   ├── mail/             # email.service.ts, emailTemplates.ts
│   │   ├── middleware/       # rateLimit.ts, upload.ts, validate.ts
│   │   ├── permissions/      # permissions.ts — central permission keys → roles
│   │   └── storage/          # s3.service.ts
│   ├── config/               # one file per external system: env, database, production, sentry
│   ├── jobs/                 # pure job logic + processor wiring, index.ts start()/stop()
│   ├── shared/
│   │   └── modules/<domain>/ # cross-app business logic (service/validator/types + __tests__)
│   ├── mobile/                # app on :3001
│   │   ├── app.ts, routes.ts, index.ts
│   │   ├── features/<domain>/ # thin per-app HTTP adapters
│   │   └── shared/            # app-specific only: config/env.ts, pagination, types, validation
│   ├── web/                   # app on :3002 — same internal shape as mobile/
│   ├── admin/                 # app on :3003 — same shape, plus its own shared/middleware/auth.ts override
│   ├── scripts/               # one-off/maintenance scripts
│   └── testHelpers/           # shared test setup
```

Run `npm run dev` to boot all three apps concurrently (ports configurable via `PORT_MOBILE`/`PORT_WEB`/`PORT_ADMIN`, default 3001/3002/3003).

**Path aliases:** `@core`, `@config`, `@shared`, `@database` — never `../../../` across those top-level boundaries.

---

## Why three apps, one repo

`mobile/`, `web/`, and `admin/` are separately deployed API surfaces for the three client apps in this monorepo (`../mobile`, `../web`, `../admin`). They are not three drafts of the same app — **do not collapse them into one app.** A new domain gets:

1. One entry in `src/shared/modules/<domain>/` (the real business logic — service, validator/dto, types). This is the doc's `modules/<domain>/` layer.
2. A thin `features/<domain>/` adapter inside whichever app(s) actually expose it (not all three necessarily need it).

Domain-agnostic infrastructure (auth primitives, HTTP errors, rate limiting, upload handling, validation middleware, S3, email, audit logging) lives once in `src/core/` and is imported by all three apps — **never duplicated into an app's own `shared/`.** Each app's `shared/` is intentionally thin now: only genuinely app-specific things live there (its own `config/env.ts`, `pagination/`, `types/`, `validation/`, and — for `admin` only — a small `middleware/auth.ts` override, see below).

### The one accepted per-app divergence

`admin/shared/middleware/auth.ts` wraps `@core/auth/authenticate`'s `resolveAuthenticatedUser` but additionally calls `setAuditActor(user.id, 'admin')`, and re-exports `requireAdmin` from `@core/auth`. `mobile`/`web` instead import `authenticate`/`requireOnboarding` straight from `@core/auth`. This is intentional — admin actions need actor-tagged audit logging that mobile/web don't — not drift to "fix" back into a fourth core variant.

---

## Domain module shape (`src/shared/modules/<domain>/`)

```
shared/modules/<domain>/
  <domain>.service.ts       # one file → flat at module root
  <domain>.validator.ts
  <domain>.types.ts
  __tests__/
    <thing>.test.ts
```

**Rule (doc §2): one file for a layer → flat at the module root; two or more files for that layer → a subfolder named after it.** Reference case: `shared/modules/currency/` (`currency.controller.ts` + `currency.routes.ts`, fully flat, no subfolder). Modules whose `service/`/`validator/` genuinely has 2+ files keep the subfolder — e.g. `auth/service/` (5 files: `auth`, `socialAuth`, `ssoHandoff`, `totp`, `webauthn`), `notifications/`, `reports/`, `ai/`, `budgets/`, `categories/`, `integrations/`, `recurring/`, `sync/`. Do not flatten those, and do not add a subfolder to a module that only has one file per layer.

## Per-app feature shape (`src/{mobile,web,admin}/features/<domain>/`)

```
features/<domain>/
  <domain>.controller.ts    # parse req → call shared/modules service → shape res
  <domain>.routes.ts        # router.<verb>(path, ...middleware, controllerFn) — no logic
```

Same flat-vs-subfolder rule applies: `expenses/` keeps a `route/`/`controller/`-equivalent subfolder (`route/expenses.routes.ts` + `route/attachments.routes.ts`, `controller/expenses.controller.ts` + `controller/attachments.controller.ts`) because it genuinely has 2+ files per layer; every other feature is flat (`<domain>.controller.ts`, `<domain>.routes.ts` directly under `features/<domain>/`).

Controllers call the shared module's service — **never** query models directly. Routes register middleware and delegate to the controller — no business logic in either file. Each app's `routes.ts` is the single aggregator that wires `authenticate` / `requireOnboarding` / `requireEntitlement` per route group.

---

## Central permissions (`src/core/permissions/permissions.ts`)

Every permission key lives here, mapped to roles:

```ts
export const Permissions = {
  ADMIN_ACCESS: 'admin.access',
  ONBOARDING_BYPASS: 'onboarding.bypass',
  ENTITLEMENT_PRO: 'entitlement.pro',
} as const;

hasPermission(role, Permissions.ENTITLEMENT_PRO) // never req.user.role === 'premium' inline
```

Adding a new gated capability: add a key here, map it to the roles that hold it, and call `hasPermission()` — never a new inline `req.user.role === '...'` check in a controller or middleware.

---

## Jobs (`src/jobs/`)

Pure logic and worker/cron wiring are split:

```
jobs/
  scheduledNotifications.ts             # pure per-run logic
  scheduledNotifications.processor.ts   # interval/cron registration, imports the pure file
  index.ts                              # export { start, stop } from './scheduledNotifications.processor'
```

A new scheduled job follows the same split; add its `start()`/`stop()` wiring to `jobs/index.ts` and have the app(s) that need it call `jobs.start()` from their own `index.ts`.

---

## Database (`database/`)

Unchanged and fully compliant: `config/` (connection config), `migrations/` (one timestamped file per schema change, flat, `<YYYYMMDDHHMMSS>-<kebab-description>.js`, `up`/`down`), `models/` (one file per table, flat, aggregated by `models/index.ts`), `seeders/`. Shared by all three apps.

---

## Errors

All error classes extend `AppError` (`@core/http/errors.ts`). No raw `throw new Error(...)` in `features/` or `shared/modules/`.

---

## Adding a new domain

1. Create `src/shared/modules/<domain>/` with `<domain>.service.ts` (+ `.validator.ts`, `.types.ts` as needed) and colocated `__tests__/`.
2. Add a thin `features/<domain>/{<domain>.routes.ts,<domain>.controller.ts}` in whichever app(s) expose it.
3. Register the route in that app's `routes.ts`, composing `authenticate`/`requireOnboarding`/`requireEntitlement` from `@core/auth` as the route needs.
4. Add any new permission keys to `@core/permissions/permissions.ts` — never an inline role check.
5. Reuse `@core/*` for anything domain-agnostic (errors, storage, mail, audit, rate limiting, upload, validation). Never add a same-named file to an app's own `shared/` — that's how the old triplication happened.

## Verification gate

Before considering any change done: typecheck, lint, and the colocated `__tests__/` run via the backend's test runner (`vitest.config.mts`), for all three apps. A change to auth or a money-adjacent module (expenses, budgets, income, loans, subscriptions) is not done until its module's tests cover the mutation path that changed.
