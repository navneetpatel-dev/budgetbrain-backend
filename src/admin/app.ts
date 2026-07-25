import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './shared/config/env';
import { errorHandler } from './shared/utils/errors';
import { globalRateLimiter } from './shared/middleware/rateLimit';
import { createRequestContextMiddleware } from '../audit';
import { sequelize } from '../models';
import { registerAdminRoutes } from './routes';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(createRequestContextMiddleware('admin'));
app.use(globalRateLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ok',
      service: 'budgetbrain-admin-api',
      version: env.API_VERSION,
      database: 'connected',
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'budgetbrain-admin-api',
      database: 'disconnected',
    });
  }
});

const apiPrefix = `/api/${env.API_VERSION}`;
registerAdminRoutes(app, apiPrefix);

app.use(errorHandler);

export default app;
