# Backend — Feature Architecture Improvement Guide

> **Goal**: Professional feature-wise architecture with proper separation of concerns. Every domain gets its own self-contained module: routes → controller (validation) → service (business logic) → model (data access). No cross-contamination, no service monoliths, no direct model access from routes.

---

## Current Architecture Anti-Patterns

### 🔴 CRITICAL: `features/shared/transaction.service.ts` — The 405-Line Monolith

This single file currently contains business logic for **6 completely separate domains**:

| Domain | Functions Inside | Lines |
|--------|-----------------|-------|
| Transactions CRUD | `createTransaction`, `updateTransaction`, `deleteTransaction`, `duplicateTransaction`, `listTransactions` | ~200 |
| Dashboard | `getDashboard`, `getHistoryCutoff`, `buildSearchVector` | ~60 |
| Categories | `listCategories`, `createCategory` | ~25 |
| Budgets | `createBudget`, `listBudgets` | ~35 |
| Goals | `createGoal`, `listGoals` | ~20 |
| Reports/Search | `globalSearch`, `generateCsvReport` | ~45 |
| Onboarding | `updateOnboarding` | ~15 |

**Why this is wrong**:
- A budget service should not live alongside a transaction service
- `getDashboard()` depends on every domain — it should be a composition, not a god function
- Changing category logic requires touching a file named `transaction.service.ts`
- Every route file that imports this gets access to every other domain's internals
- No clear ownership — who owns budget business logic?

---

### 🟠 HIGH: Routes Directly Access Models

Multiple route files bypass the service layer entirely and call Sequelize models directly:

| Route File | Direct Model Usage |
|-----------|-------------------|
| `budgets/routes.ts` | `Budget.findOne()`, `budget.update()`, `budget.destroy()` |
| `goals/routes.ts` | `Goal.findOne()`, `goal.update()`, `goal.destroy()`, `GoalContribution.create()`, `GoalContribution.destroy()` |
| `categories/routes.ts` | `Category.findOne()`, `category.update()` |
| `income/routes.ts` | `IncomeSource.findAll()`, `IncomeSource.create()` |
| `accounts/routes.ts` | `FinancialAccount.findAll()`, `FinancialAccount.create()`, `FinancialAccount.findOne()` |
| `investments/routes.ts` | `Investment.findAll()`, `Investment.create()`, `investment.update()`, enrichment logic inline |
| `notifications/routes.ts` | `Notification.findAll()`, `Device.findOne()`, `device.update()`, `Device.create()` |
| `support/routes.ts` | `SupportTicket.findAll()`, `SupportTicket.create()`, `SupportTicket.findOne()` |
| `family/routes.ts` | `FamilyGroup.create()`, `FamilyMember.create()`, `FamilyMember.findAll()`, `FamilyGroup.findOne()` |
| `subscriptions/routes.ts` | `Subscription.create()`, `Subscription.update()`, `User.findByPk()`, `User.update()` |
| `users/routes.ts` | `User.findByPk()`, `user.update()` |
| `integrations/routes.ts` | `ParsedTransaction.create()`, `ParsedTransaction.findOne()`, `parsed.update()` |

**11 of 19 route files** have direct model access. This means:
- No way to unit test business logic without a database
- Business rules (free limits, currency defaults) are scattered
- Model-level concerns leak into HTTP handler code

---

### 🟡 MEDIUM: Domain Logic in Wrong Location

| Logic | Where It Lives | Where It Should Live |
|-------|---------------|---------------------|
| Budget creation + free-limit check | `transaction.service.ts` | `features/budgets/budget.service.ts` |
| Goal creation + contribution + completion detection | Partially in `transaction.service.ts`, partially inline in `goals/routes.ts` | `features/goals/goal.service.ts` |
| Category creation + free-limit check | `transaction.service.ts` | `features/categories/category.service.ts` |
| RevenueCat webhook parsing | Inline in `subscriptions/routes.ts` | `features/subscriptions/subscription.service.ts` |
| Investment currentValue/gainLoss calculation | Inline in `investments/routes.ts` GET handler | `features/investments/investment.service.ts` |
| Onboarding update | `transaction.service.ts` | `features/users/user.service.ts` (already partially has `deleteUserAccount`) |
| Dashboard assembly | `transaction.service.ts` | `features/dashboard/dashboard.service.ts` |
| CSV generation | `transaction.service.ts` | `features/reports/report.service.ts` or `shared/csv.service.ts` |
| Budget alert check | `budgetAlert.service.ts` ✅ | (correctly placed) |

---

### 🟡 MEDIUM: Validation Schema Duplication

Zod schemas are defined inline in every route handler. Common schemas like pagination `{ page, limit }` are redefined 9+ times:

```typescript
// Appears in: admin/routes.ts, expenses/routes.ts, income/routes.ts, 
// notifications/routes.ts, sync/routes.ts, etc.
z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() })
```

---

### 🟡 MEDIUM: Mixed Concerns in Route Handlers

| Route File | Mixed Concern |
|-----------|--------------|
| `subscriptions/routes.ts` | Webhook handler has 50+ lines of inline logic: plan detection, status determination, role assignment, subscription expiry calculation |
| `goals/routes.ts` | Contribution handler has inline notification creation, completion detection, amount calculation |
| `admin/routes.ts` | Each handler manually calls `logAudit` after the service call — audit logging should be a service concern, not a route concern |
| `expenses/routes.ts` | Manually calls `logAudit` after creation — same issue |

---

### 🟢 LOW: Missing Dedicated Service Files

These features have route files but **no dedicated service file** — business logic is either in routes directly or shoved into `transaction.service.ts`:

| Feature | Has Route | Has Service | Business Logic Location |
|---------|-----------|-------------|------------------------|
| Categories | ✅ | ❌ | `transaction.service.ts` |
| Goals | ✅ | ❌ | `transaction.service.ts` + inline in routes |
| Budgets | ✅ | ⚠️ partial (`budgetAlert.service.ts`) | `transaction.service.ts` + inline in routes |
| Income | ✅ | ❌ | `transaction.service.ts` + inline in routes |
| Subscriptions | ✅ | ❌ | Inline in routes (50-line webhook) |
| Accounts | ✅ | ❌ | Direct model access in routes |
| Investments | ✅ | ❌ | Direct model access + inline enrichment |
| Notifications | ✅ | ✅ (partial) | `notification.service.ts` + direct model in routes |
| Family | ✅ | ❌ | Direct model access in routes |
| Support | ✅ | ❌ | Direct model access in routes |
| Integrations | ✅ | ✅ (partial — parse.service exists) | Partial service + direct model in routes |

---

### 🟢 LOW: Admin Service Duplications

`admin.service.ts` has:
1. A `PLAN_PRICING` constant and MRR calculation that duplicates the `computeMrrByPlan` function (which exists but is only used by `getRevenue`, not by `getAdminDashboard`)
2. `getAdminDashboard` has **inline MRR calculation** (lines ~48-52) that's duplicated from `getRevenue` (lines ~113-121)
3. The dashboard and revenue endpoint compute MRR differently but should use the same function

---

## Target Architecture

Every feature module should follow this exact directory structure:

```
src/features/<name>/
├── <name>.routes.ts          # Route definitions ONLY — mount paths, middleware, validation, delegate to service
├── <name>.service.ts         # All business logic — CRUD, calculations, rules, orchestration
├── <name>.validation.ts      # All Zod schemas for this module (exported, reusable)
└── <name>.test.ts            # Unit tests (future)
```

### Route File Responsibility (Thin — ~30 lines average)

```typescript
// ✅ CORRECT: Route file does ONLY: define paths, parse input, call service, return response
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const data = await budgetService.listBudgets(userId);
  successResponse(res, data);
}));

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const userId = (req as AuthRequest).userId!;
  const data = createBudgetSchema.parse(req.body);
  const budget = await budgetService.createBudget(userId, data);
  successResponse(res, budget, 201);
}));
```

```typescript
// ❌ WRONG: Route file has business logic, model access, or multi-domain orchestration
router.post('/', asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  const user = await User.findByPk(userId);
  if (user.role === 'free') {
    const count = await Budget.count({ where: { userId } });
    if (count >= 3) throw new AppError(403, 'Limit reached');
  }
  const budget = await Budget.create({ ...data, currency: user.currency });
  successResponse(res, budget);
}));
```

### Service File Responsibility (Business Logic)

```typescript
// ✅ CORRECT: Service has all business rules, model operations, validation
export async function createBudget(userId: string, data: CreateBudgetInput): Promise<Budget> {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');
  
  if (user.role === 'free') {
    const count = await Budget.count({ where: { userId } });
    if (count >= FREE_BUDGET_LIMIT) {
      throw new AppError(403, 'Free plan limited to 3 budgets', 'LIMIT_REACHED');
    }
  }
  
  return Budget.create({
    userId,
    name: data.name,
    type: data.type,
    amount: data.amount,
    currency: data.currency ?? user.currency,
    categoryId: data.categoryId ?? null,
    startDate: new Date(data.startDate),
    alertThreshold: data.alertThreshold ?? 80,
  });
}
```

### Validation File

```typescript
// features/budgets/budget.validation.ts
import { z } from 'zod';

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['monthly', 'weekly', 'category']),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
});

export const updateBudgetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  amount: z.number().positive().optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
  endDate: z.string().optional(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
```

---

## Extraction Plan: What to Create

### Phase 1 — Split the Monolith (`transaction.service.ts`)

Break `features/shared/transaction.service.ts` into dedicated services. Delete the file afterward.

#### 1.1 `features/expenses/transaction.service.ts`

Move these functions from the monolith:
- `createTransaction(userId, data)` — with `checkBudgetAlertsAfterExpense` call
- `updateTransaction(userId, id, data)`
- `deleteTransaction(userId, id)`
- `duplicateTransaction(userId, id)`
- `listTransactions(userId, filters)`
- `globalSearch(userId, query)`
- `buildSearchVector(data)` (private helper)
- `getHistoryCutoff(role)` (private helper)

This is the **only** service that should create/update/delete transactions.

#### 1.2 `features/dashboard/dashboard.service.ts`

Move:
- `getDashboard(userId)` — make it compose data from other services:
  ```typescript
  export async function getDashboard(userId: string) {
    const user = await userService.getUser(userId);
    const [income, expenses, recentTx, budgets, goals, breakdown] = await Promise.all([
      transactionService.getTotalIncome(userId, user),
      transactionService.getTotalExpenses(userId, user),
      transactionService.getRecentTransactions(userId, user, 10),
      budgetService.listBudgets(userId),
      goalService.listGoals(userId),
      transactionService.getCategoryBreakdown(userId, user),
    ]);
    return { summary: { ... }, recentTransactions: recentTx, budgets, goals, categoryBreakdown: breakdown };
  }
  ```

Add helper methods to `transaction.service.ts`:
- `getTotalIncome(userId, user)` — returns number
- `getTotalExpenses(userId, user)` — returns number
- `getRecentTransactions(userId, user, limit)` — returns Transaction[]
- `getCategoryBreakdown(userId, user)` — returns breakdown array

#### 1.3 `features/categories/category.service.ts`

Move:
- `listCategories(userId)`
- `createCategory(userId, data)` — with free tier limit check
- `updateCategory(userId, id, data)`
- `archiveCategory(userId, id)`
- `reorderCategories(userId, orderedIds)`

#### 1.4 `features/budgets/budget.service.ts`

Move:
- `createBudget(userId, data)` — with free tier limit check
- `listBudgets(userId)`
- `updateBudget(userId, id, data)`
- `deleteBudget(userId, id)`

Already correctly placed and stays: `features/budgets/budgetAlert.service.ts`

#### 1.5 `features/goals/goal.service.ts`

Move:
- `createGoal(userId, data)`
- `listGoals(userId)`
- `updateGoal(userId, id, data)`
- `deleteGoal(userId, id)` — also cascade-delete contributions
- `contributeToGoal(userId, goalId, amount, notes?)` — includes completion detection + notification
- `checkAndCompleteGoal(goal)` (private helper)

#### 1.6 `features/reports/report.service.ts`

Move:
- `generateCsvReport(userId, startDate?, endDate?)`
- `generatePdfReport` is already in `features/reports/pdf.service.ts` ✅

#### 1.7 Move `updateOnboarding` to `features/users/user.service.ts`

`user.service.ts` already owns `deleteUserAccount`. Add `updateOnboarding` and `getUser`.

---

### Phase 2 — Create Missing Service Files

#### 2.1 `features/income/income.service.ts`

```typescript
export async function listIncome(userId: string, filters: IncomeFilters): Promise<PaginatedTransactions>;
export async function createIncome(userId: string, data: CreateIncomeInput): Promise<Transaction>;
export async function updateIncome(userId: string, id: string, data: UpdateIncomeInput): Promise<Transaction>;
export async function deleteIncome(userId: string, id: string): Promise<void>;
export async function listSources(userId: string): Promise<IncomeSource[]>;
export async function createSource(userId: string, data: CreateSourceInput): Promise<IncomeSource>;
```

#### 2.2 `features/subscriptions/subscription.service.ts`

```typescript
export async function handleWebhook(event: RevenueCatEvent): Promise<void>;
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus>;
export async function restoreSubscription(userId: string, revenueCatId?: string): Promise<RestoreResult>;
```

**Move the 50-line webhook handler logic** from `subscriptions/routes.ts` into `handleWebhook()`. The route should be:

```typescript
router.post('/webhook', asyncHandler(async (req, res) => {
  const secret = req.headers['authorization'];
  if (env.REVENUECAT_WEBHOOK_SECRET && secret !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`) {
    throw new AppError(401, 'Invalid webhook secret');
  }
  await subscriptionService.handleWebhook(req.body);
  successResponse(res, { received: true });
}));
```

#### 2.3 `features/accounts/account.service.ts`

```typescript
export async function listAccounts(userId: string): Promise<FinancialAccount[]>;
export async function createAccount(userId: string, data: CreateAccountInput): Promise<FinancialAccount>;
export async function updateAccount(userId: string, id: string, data: UpdateAccountInput): Promise<FinancialAccount>;
```

#### 2.4 `features/investments/investment.service.ts`

```typescript
export async function listInvestments(userId: string): Promise<EnrichedInvestment[]>;
export async function createInvestment(userId: string, data: CreateInvestmentInput): Promise<Investment>;
export async function updateInvestment(userId: string, id: string, data: UpdateInvestmentInput): Promise<Investment>;

// Private helpers
function enrichInvestment(inv: Investment): EnrichedInvestment;
```

The `enrichInvestment` function moves the inline `.map()` from the route handler into the service.

#### 2.5 `features/notifications/notification.service.ts` (expand)

Add:
```typescript
export async function listNotifications(userId: string): Promise<Notification[]>;
export async function markAsRead(userId: string, id: string): Promise<Notification>;
export async function registerDevice(userId: string, data: RegisterDeviceInput): Promise<Device>;
```

Already exists: `createNotification`, `sendPushToUser` ✅

#### 2.6 `features/family/family.service.ts`

```typescript
export async function createGroup(ownerId: string, name: string): Promise<FamilyGroup>;
export async function joinGroup(userId: string, inviteCode: string): Promise<FamilyMember>;
export async function listUserMemberships(userId: string): Promise<FamilyMembership[]>;
```

#### 2.7 `features/support/support.service.ts`

```typescript
export async function listUserTickets(userId: string): Promise<SupportTicket[]>;
export async function createTicket(userId: string, data: CreateTicketInput): Promise<SupportTicket>;
export async function getTicket(userId: string, ticketId: string): Promise<SupportTicket>;
```

#### 2.8 `features/integrations/integrations.service.ts`

```typescript
export async function parseSms(userId: string, content: string): Promise<ParsedResult>;
export async function parseEmail(userId: string, subject: string, body: string): Promise<ParsedResult>;
export async function listPending(userId: string): Promise<ParsedTransaction[]>;
export async function confirmParsed(userId: string, parsedId: string, data: ConfirmInput): Promise<ConfirmedResult>;
export async function rejectParsed(userId: string, parsedId: string): Promise<void>;
```

---

### Phase 3 — Extract Shared Validation Schemas

Create `src/shared/validation.ts`:

```typescript
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
```

Import these in every route file that needs pagination/date filters. Delete the 9+ duplicate definitions.

---

### Phase 4 — Route File Cleanup

After creating services, every route file should look like this (budgets example):

```typescript
// features/budgets/budget.routes.ts — ~50 lines

import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as budgetService from './budget.service';
import { createBudgetSchema, updateBudgetSchema } from './budget.validation';
import { uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const budgets = await budgetService.listBudgets((req as AuthRequest).userId!);
  successResponse(res, budgets);
}));

router.post('/', asyncHandler(async (req, res) => {
  const data = createBudgetSchema.parse(req.body);
  const budget = await budgetService.createBudget((req as AuthRequest).userId!, data);
  successResponse(res, budget, 201);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateBudgetSchema.parse(req.body);
  const budget = await budgetService.updateBudget((req as AuthRequest).userId!, id, data);
  successResponse(res, budget);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  await budgetService.deleteBudget((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Budget deleted' });
}));

export default router;
```

**No model imports. No `User.findByPk()`. No `Budget.findOne()`. No business logic.**

---

### Phase 5 — Audit Logging Consolidation

Currently `logAudit` is called manually in route handlers (`expenses/routes.ts`, `admin/routes.ts`). This should be a **service concern**.

**Option A — Service-based (preferred)**:
Each service function that needs auditing calls `logAudit` internally:
```typescript
export async function createTransaction(userId: string, data: CreateTxInput) {
  const tx = await Transaction.create(...);
  await logAudit(userId, 'create', 'transaction', tx.id);
  return tx;
}
```

**Option B — Middleware-based**:
Create a middleware that captures `req.auditAction` and logs after the handler completes.

**Recommendation**: Option A. Simple, explicit, no magic. Remove `logAudit` calls from route files.

---

### Phase 6 — Admin Service Deduplication

In `admin.service.ts`:

1. Delete the inline MRR calculation in `getAdminDashboard()` (lines ~48-52)
2. Call `computeMrrByPlan()` — which already exists — from both `getAdminDashboard()` and `getRevenue()`
3. The `PLAN_PRICING` constant in admin.service already exists as a module-level var — keep it there but make `computeMrrByPlan` the single consumer

---

## New File Creation Summary

```
Files to CREATE:

src/features/expenses/
  transaction.service.ts       ← split from shared/transaction.service.ts
  transaction.validation.ts    ← Zod schemas extracted from routes

src/features/dashboard/
  dashboard.service.ts         ← split from shared/transaction.service.ts

src/features/categories/
  category.service.ts          ← split from shared/transaction.service.ts
  category.validation.ts

src/features/budgets/
  budget.service.ts            ← split from shared/transaction.service.ts
  budget.validation.ts

src/features/goals/
  goal.service.ts              ← split from shared/transaction.service.ts
  goal.validation.ts

src/features/reports/
  report.service.ts            ← CSV generation from shared/transaction.service.ts

src/features/income/
  income.service.ts            ← NEW — income + source CRUD
  income.validation.ts

src/features/subscriptions/
  subscription.service.ts      ← NEW — webhook handler + status/restore
  subscription.validation.ts

src/features/accounts/
  account.service.ts           ← NEW
  account.validation.ts

src/features/investments/
  investment.service.ts        ← NEW — CRUD + enrichment
  investment.validation.ts

src/features/notifications/
  (expand notification.service.ts) ← add list/markRead/registerDevice

src/features/family/
  family.service.ts            ← NEW
  family.validation.ts

src/features/support/
  support.service.ts           ← NEW
  support.validation.ts

src/features/integrations/
  integrations.service.ts      ← NEW — wraps parse.service + ParsedTransaction CRUD
  integrations.validation.ts

src/shared/
  validation.ts                ← shared pagination, date range, UUID schemas

Files to EXPAND:

src/features/users/user.service.ts    ← add updateOnboarding, getUser
src/features/notifications/notification.service.ts ← add list/markRead/registerDevice
src/features/admin/admin.service.ts   ← deduplicate MRR calculation

Files to DELETE:

src/features/shared/transaction.service.ts   ← split into 7 services
```

**Total: 15 new files, 2 expanded files, 1 deleted file**

---

## Route File Line Reduction

| Route File | Current | After Cleanup | Lines Saved |
|-----------|---------|---------------|-------------|
| `budgets/routes.ts` | 80 | ~45 | 35 |
| `goals/routes.ts` | 119 | ~60 | 59 |
| `categories/routes.ts` | 83 | ~50 | 33 |
| `income/routes.ts` | 116 | ~60 | 56 |
| `subscriptions/routes.ts` | 145 | ~60 | 85 |
| `accounts/routes.ts` | 68 | ~40 | 28 |
| `investments/routes.ts` | 75 | ~40 | 35 |
| `notifications/routes.ts` | 76 | ~45 | 31 |
| `support/routes.ts` | 55 | ~35 | 20 |
| `family/routes.ts` | 69 | ~40 | 29 |
| `integrations/routes.ts` | 112 | ~55 | 57 |
| `users/routes.ts` | 72 | ~45 | 27 |
| `admin/routes.ts` | 133 | ~100 | 33 |
| `expenses/routes.ts` | 108 | ~70 | 38 |
| **Total** | **~1311** | **~745** | **~566** |

---

## Verification Checklist

After refactoring, every route file must pass:

- [ ] No `import { Budget, Goal, Category, ... } from '../../models'` — models only imported in service files
- [ ] No `Model.findOne()`, `Model.create()`, `Model.update()`, `Model.destroy()` anywhere in routes
- [ ] No business logic in routes — no `if (role === 'free')`, no `count >= LIMIT`, no math calculations
- [ ] Every route handler is ≤5 lines: parse input → call service → return response
- [ ] All Zod schemas live in `*.validation.ts` files, not inline
- [ ] No duplicated pagination/date-range schemas — use `shared/validation.ts`
- [ ] No `logAudit()` calls in route files — handled in service layer
- [ ] Every feature has its own `*.service.ts` file that contains ALL business logic for that domain
- [ ] Services never import from other feature services' internals (cross-feature calls only through public exports)

---

## Service-to-Service Communication Rules

When one service needs another service's data:

| Scenario | Rule |
|----------|------|
| Dashboard needs budgets + goals + transactions | Dashboard service imports from `budget.service`, `goal.service`, `transaction.service` — each as public API |
| Budget alert needs notification creation | `budgetAlert.service.ts` imports `createNotification` from `notification.service` ✅ (already correct) |
| Expense creation needs budget alert check | `transaction.service.ts` imports `checkBudgetAlertsAfterExpense` from `budgetAlert.service` ✅ (already correct) |
| Goal contribution needs notification | `goal.service.ts` imports `createNotification` from `notification.service` (currently inline in route — move to service) |

**Rule**: Services can import from other services. Routes cannot import from services they don't own. A route file in `features/budgets/` can only import from `budget.service.ts` and `budgetAlert.service.ts` — never from `goal.service.ts` or `transaction.service.ts`.

---

## Priority Order

1. **Phase 1** (highest impact): Split `shared/transaction.service.ts` into 7 dedicated service files. This touches every route file but makes the architecture correct.
2. **Phase 2**: Create missing service files for features that currently use direct model access (accounts, investments, subscriptions, family, support, income, integrations).
3. **Phase 3**: Extract shared validation schemas.
4. **Phase 4**: Clean up route files — remove model imports, remove inline logic.
5. **Phase 5**: Move audit logging from routes to services.
6. **Phase 6**: Deduplicate admin service MRR calculation.
