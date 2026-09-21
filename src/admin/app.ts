import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './shared/config/env';
import { errorHandler } from './shared/utils/errors';
import { globalRateLimiter } from './shared/middleware/rateLimit';
import { createRequestContextMiddleware } from '../shared/audit';
import { createCorsOptions } from '../shared/http/cors';
import { jsonNotFound, registerApiAliases, registerApiIndex } from '../shared/http/routes';
import { sequelize } from '@database/models';
import { setUploadStaticHeaders } from '../shared/uploads/sniffFileType';
import { registerAdminRoutes } from './routes';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors(createCorsOptions(env.CORS_ORIGIN)));
app.use(express.json({ limit: '10mb' }));
app.use(createRequestContextMiddleware('admin'));
app.use(globalRateLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { setHeaders: setUploadStaticHeaders }));
app.use('/admin/uploads', express.static(path.join(process.cwd(), 'uploads'), { setHeaders: setUploadStaticHeaders }));

async function health(_req: express.Request, res: express.Response) {
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
}

app.get(['/health', '/admin/health'], health);
registerApiIndex(app, 'admin', env.API_VERSION);
registerApiAliases(app, 'admin', env.API_VERSION, registerAdminRoutes);

app.use(jsonNotFound);
app.use(errorHandler);

export default app;
