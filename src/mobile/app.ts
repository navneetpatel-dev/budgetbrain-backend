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
import { registerMobileRoutes } from './routes';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors(createCorsOptions(env.CORS_ORIGIN)));
app.use(express.json({ limit: '10mb' }));
app.use(createRequestContextMiddleware('mobile'));
app.use(globalRateLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { setHeaders: setUploadStaticHeaders }));
app.use('/mobile/uploads', express.static(path.join(process.cwd(), 'uploads'), { setHeaders: setUploadStaticHeaders }));

async function health(_req: express.Request, res: express.Response) {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ok',
      service: 'budgetbrain-mobile-api',
      version: env.API_VERSION,
      database: 'connected',
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'budgetbrain-mobile-api',
      database: 'disconnected',
    });
  }
}

app.get(['/health', '/mobile/health'], health);
registerApiIndex(app, 'mobile', env.API_VERSION);
registerApiAliases(app, 'mobile', env.API_VERSION, registerMobileRoutes);

app.use(jsonNotFound);
app.use(errorHandler);

export default app;
