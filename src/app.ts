import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './shared/config/env';
import { errorHandler } from './shared/utils/errors';
import { globalRateLimiter } from './shared/middleware/rateLimit';
import { sequelize } from './shared/models';
import { registerMobileRoutes } from './mobile/routes';
import { registerWebRoutes } from './web/routes';
import { registerAdminRoutes } from './admin/routes';

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
    res.json({ status: 'ok', service: 'budgetbrain-api', version: env.API_VERSION, database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', service: 'budgetbrain-api', database: 'disconnected' });
  }
});

const apiPrefix = `/api/${env.API_VERSION}`;

// Platform routers — same public paths as before (no client breakage)
// web: shared user APIs; mobile: sync; admin: /admin
registerWebRoutes(app, apiPrefix);
registerMobileRoutes(app, apiPrefix);
registerAdminRoutes(app, apiPrefix);

app.use(errorHandler);

export default app;
