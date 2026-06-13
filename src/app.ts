import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './utils/errors';
import { globalRateLimiter } from './middleware/rateLimit';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import expenseRoutes from './routes/expenses';
import incomeRoutes from './routes/income';
import categoryRoutes from './routes/categories';
import budgetRoutes from './routes/budgets';
import goalRoutes from './routes/goals';
import reportRoutes from './routes/reports';
import subscriptionRoutes from './routes/subscriptions';
import notificationRoutes from './routes/notifications';
import familyRoutes from './routes/family';
import aiRoutes from './routes/ai';
import attachmentRoutes from './routes/attachments';
import syncRoutes from './routes/sync';
import accountRoutes from './routes/accounts';
import investmentRoutes from './routes/investments';
import netWorthRoutes from './routes/netWorth';
import integrationRoutes from './routes/integrations';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
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
