# Backend — Feature Structure

```
src/
  features/           # Feature modules (routes + services per domain)
    auth/             # routes.ts, auth.service.ts, socialAuth.service.ts
    users/
    expenses/         # routes.ts, transaction.service.ts, attachments.routes.ts
    income/           # income.service.ts
    categories/       # category.service.ts
    budgets/          # budget.service.ts, budgetAlert.service.ts
    goals/            # goal.service.ts
    dashboard/        # dashboard.service.ts
    reports/          # report.service.ts, pdf.service.ts
    subscriptions/
    notifications/    # notification, push, scheduledJobs services
    family/
    ai/
    sync/
    accounts/
    investments/
    net-worth/
    integrations/     # parse.service.ts
    admin/
    support/
    shared/           # Cross-feature services
      email.service.ts
      s3.service.ts
      audit.service.ts
  shared/             # Shared validation schemas
    validation.ts
  models/             # Sequelize models (centralized — associations)
  middleware/
  utils/
  config/
```

Routes mount from `app.ts` → `./features/<domain>/routes`.
