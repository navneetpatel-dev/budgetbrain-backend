import authRoutes from './features/auth/auth.routes';
import usersRoutes from './features/users/users.routes';
import expensesRoutes from './features/expenses/route/expenses.routes';
import incomeRoutes from './features/income/income.routes';
import categoriesRoutes from './features/categories/categories.routes';
import budgetsRoutes from './features/budgets/budgets.routes';
import goalsRoutes from './features/goals/goals.routes';
import reportsRoutes from './features/reports/reports.routes';
import notificationsRoutes from './features/notifications/notifications.routes';
import familyRoutes from './features/family/family.routes';
import aiRoutes from './features/ai/ai.routes';
import syncRoutes from './features/sync/sync.routes';
import accountsRoutes from './features/accounts/accounts.routes';
import investmentsRoutes from './features/investments/investments.routes';
import netWorthRoutes from './features/net-worth/net-worth.routes';
import retiredIntegrationsRoutes from '@shared/modules/transaction-detection/retiredIntegrations.routes';
import supportRoutes from './features/support/support.routes';
import expenseAttachmentRoutes from './features/expenses/route/attachments.routes';
import loansRoutes from './features/loans/loans.routes';
import recurringRoutes from './features/recurring/recurring.routes';
import subscriptionsRoutes from './features/subscriptions/subscriptions.routes';
import searchRoutes from './features/search/search.routes';
import currencyRoutes from '@shared/modules/currency/currency.routes';
import detectedTransactionRoutes from '@shared/modules/transaction-detection/transactionDetection.routes';
import { authenticate } from '@core/auth/authenticate';
import { requireOnboarding } from '@core/auth/requireOnboarding';
import { requireEntitlement } from '@shared/middleware/requireEntitlement';
import type { Express } from 'express';

export function registerMobileRoutes(app: Express, apiPrefix: string): void {
  // Public & self-authenticating routes
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/users`, usersRoutes);
  app.use(`${apiPrefix}/subscriptions`, subscriptionsRoutes);

  // Protected feature routes requiring both authentication & onboarding completion
  const protectedFeature = [authenticate, requireOnboarding];
  app.use(`${apiPrefix}/expenses`, protectedFeature, expensesRoutes);
  app.use(`${apiPrefix}/income`, protectedFeature, incomeRoutes);
  app.use(`${apiPrefix}/categories`, protectedFeature, categoriesRoutes);
  app.use(`${apiPrefix}/budgets`, protectedFeature, budgetsRoutes);
  app.use(`${apiPrefix}/goals`, protectedFeature, requireEntitlement('pro'), goalsRoutes);
  app.use(`${apiPrefix}/reports`, protectedFeature, reportsRoutes);
  app.use(`${apiPrefix}/notifications`, protectedFeature, notificationsRoutes);
  app.use(`${apiPrefix}/family`, protectedFeature, requireEntitlement('pro'), familyRoutes);
  app.use(`${apiPrefix}/ai`, protectedFeature, requireEntitlement('pro'), aiRoutes);
  app.use(`${apiPrefix}/sync`, protectedFeature, requireEntitlement('pro'), syncRoutes);
  app.use(`${apiPrefix}/accounts`, protectedFeature, accountsRoutes);
  app.use(`${apiPrefix}/investments`, protectedFeature, investmentsRoutes);
  app.use(`${apiPrefix}/net-worth`, protectedFeature, netWorthRoutes);
  app.use(`${apiPrefix}/integrations`, protectedFeature, retiredIntegrationsRoutes);
  app.use(`${apiPrefix}/support`, protectedFeature, supportRoutes);
  app.use(`${apiPrefix}/expenses`, protectedFeature, expenseAttachmentRoutes);
  app.use(`${apiPrefix}/loans`, protectedFeature, loansRoutes);
  app.use(`${apiPrefix}/recurring-series`, protectedFeature, recurringRoutes);
  app.use(`${apiPrefix}/search`, protectedFeature, searchRoutes);
  app.use(`${apiPrefix}/currencies`, protectedFeature, currencyRoutes);
  app.use(`${apiPrefix}/detected-transactions`, protectedFeature, detectedTransactionRoutes);
}


