import authRoutes from './features/auth/route';
import usersRoutes from './features/users/route';
import expensesRoutes from './features/expenses/route';
import incomeRoutes from './features/income/route';
import categoriesRoutes from './features/categories/route';
import budgetsRoutes from './features/budgets/route';
import goalsRoutes from './features/goals/route';
import reportsRoutes from './features/reports/route';
import subscriptionsRoutes from './features/subscriptions/route';
import notificationsRoutes from './features/notifications/route';
import familyRoutes from './features/family/route';
import aiRoutes from './features/ai/route';
import accountsRoutes from './features/accounts/route';
import investmentsRoutes from './features/investments/route';
import netWorthRoutes from './features/net-worth/route';
import integrationsRoutes from './features/integrations/route';
import supportRoutes from './features/support/route';
import expenseAttachmentRoutes from './features/expenses/route/attachments.routes';
import type { Express } from 'express';

/** Web platform routers (full copies under ./features). */
export function registerWebRoutes(app: Express, apiPrefix: string): void {
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/users`, usersRoutes);
  app.use(`${apiPrefix}/expenses`, expensesRoutes);
  app.use(`${apiPrefix}/income`, incomeRoutes);
  app.use(`${apiPrefix}/categories`, categoriesRoutes);
  app.use(`${apiPrefix}/budgets`, budgetsRoutes);
  app.use(`${apiPrefix}/goals`, goalsRoutes);
  app.use(`${apiPrefix}/reports`, reportsRoutes);
  app.use(`${apiPrefix}/subscriptions`, subscriptionsRoutes);
  app.use(`${apiPrefix}/notifications`, notificationsRoutes);
  app.use(`${apiPrefix}/family`, familyRoutes);
  app.use(`${apiPrefix}/ai`, aiRoutes);
  app.use(`${apiPrefix}/accounts`, accountsRoutes);
  app.use(`${apiPrefix}/investments`, investmentsRoutes);
  app.use(`${apiPrefix}/net-worth`, netWorthRoutes);
  app.use(`${apiPrefix}/integrations`, integrationsRoutes);
  app.use(`${apiPrefix}/support`, supportRoutes);
  app.use(`${apiPrefix}/expenses`, expenseAttachmentRoutes);
}
