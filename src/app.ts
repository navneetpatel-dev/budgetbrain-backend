import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './utils/errors';
import { globalRateLimiter } from './middleware/rateLimit';

import authRoutes from './features/auth/routes';
import userRoutes from './features/users/routes';
import expenseRoutes from './features/expenses/routes';
import incomeRoutes from './features/income/routes';
import categoryRoutes from './features/categories/routes';
import budgetRoutes from './features/budgets/routes';
import goalRoutes from './features/goals/routes';
import reportRoutes from './features/reports/routes';
import subscriptionRoutes from './features/subscriptions/routes';
import notificationRoutes from './features/notifications/routes';
import familyRoutes from './features/family/routes';
import aiRoutes from './features/ai/routes';
import attachmentRoutes from './features/expenses/attachments.routes';
import syncRoutes from './features/sync/routes';
import accountRoutes from './features/accounts/routes';
import investmentRoutes from './features/investments/routes';
import netWorthRoutes from './features/net-worth/routes';
import integrationRoutes from './features/integrations/routes';
import adminRoutes from './features/admin/routes';
import supportRoutes from './features/support/routes';
import path from 'path';

import { sequelize } from './models';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(globalRateLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok', service: 'expenseflow-api', version: env.API_VERSION, database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'expenseflow-api', database: 'disconnected' });
  }
});

const apiPrefix = `/api/${env.API_VERSION}`;

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/users`, userRoutes);
app.use(`${apiPrefix}/expenses`, expenseRoutes);
app.use(`${apiPrefix}/expenses`, attachmentRoutes);
app.use(`${apiPrefix}/income`, incomeRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/budgets`, budgetRoutes);
app.use(`${apiPrefix}/goals`, goalRoutes);
app.use(`${apiPrefix}/reports`, reportRoutes);
app.use(`${apiPrefix}/subscriptions`, subscriptionRoutes);
app.use(`${apiPrefix}/notifications`, notificationRoutes);
app.use(`${apiPrefix}/family`, familyRoutes);
app.use(`${apiPrefix}/ai`, aiRoutes);
app.use(`${apiPrefix}/sync`, syncRoutes);
app.use(`${apiPrefix}/accounts`, accountRoutes);
app.use(`${apiPrefix}/investments`, investmentRoutes);
app.use(`${apiPrefix}/net-worth`, netWorthRoutes);
app.use(`${apiPrefix}/integrations`, integrationRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/support`, supportRoutes);

app.use(errorHandler);

export default app;
