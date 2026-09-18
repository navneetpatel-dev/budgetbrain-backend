import authRoutes from './features/auth/route';
import usersRoutes from './features/users/route';
import expensesRoutes from './features/expenses/route';
import incomeRoutes from './features/income/route';
import categoriesRoutes from './features/categories/route';
import budgetsRoutes from './features/budgets/route';
import goalsRoutes from './features/goals/route';
import reportsRoutes from './features/reports/route';
import notificationsRoutes from './features/notifications/route';
import familyRoutes from './features/family/route';
import aiRoutes from './features/ai/route';
import accountsRoutes from './features/accounts/route';
import investmentsRoutes from './features/investments/route';
import netWorthRoutes from './features/net-worth/route';
import integrationsRoutes from './features/integrations/route';
import supportRoutes from './features/support/route';
import expenseAttachmentRoutes from './features/expenses/route/attachments.routes';
import loansRoutes from './features/loans/route';
import recurringRoutes from './features/recurring/route';
import subscriptionsRoutes from './features/subscriptions/route';
import searchRoutes from './features/search/route';
import { authenticate, requireOnboarding } from './shared/middleware/auth';
import { requireEntitlement } from '@shared/middleware/requireEntitlement';
import type { Express } from 'express';

export function registerWebRoutes(app: Express, apiPrefix: string): void {
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
  app.use(`${apiPrefix}/goals`, protectedFeature, goalsRoutes);
  app.use(`${apiPrefix}/reports`, protectedFeature, reportsRoutes);
  app.use(`${apiPrefix}/notifications`, protectedFeature, notificationsRoutes);
  app.use(`${apiPrefix}/family`, protectedFeature, requireEntitlement('pro'), familyRoutes);
  app.use(`${apiPrefix}/ai`, protectedFeature, requireEntitlement('pro'), aiRoutes);
  app.use(`${apiPrefix}/accounts`, protectedFeature, accountsRoutes);
  app.use(`${apiPrefix}/investments`, protectedFeature, investmentsRoutes);
  app.use(`${apiPrefix}/net-worth`, protectedFeature, netWorthRoutes);
  app.use(`${apiPrefix}/integrations`, protectedFeature, integrationsRoutes);
  app.use(`${apiPrefix}/support`, protectedFeature, supportRoutes);
  app.use(`${apiPrefix}/expenses`, protectedFeature, expenseAttachmentRoutes);
  app.use(`${apiPrefix}/loans`, protectedFeature, loansRoutes);
  app.use(`${apiPrefix}/recurring-series`, protectedFeature, recurringRoutes);
  app.use(`${apiPrefix}/search`, protectedFeature, searchRoutes);
}


