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
import { registerWebRoutes } from './routes';

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors(createCorsOptions(env.CORS_ORIGIN)));
app.use(
  express.json({
    limit: '10mb',
    // Preserve the exact raw bytes alongside the parsed body so webhook handlers
    // (e.g. Razorpay) can verify an HMAC signature computed over the original
    // payload — re-serializing req.body would not reproduce the same bytes.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(createRequestContextMiddleware('web'));
app.use(globalRateLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/web/uploads', express.static(path.join(process.cwd(), 'uploads')));

async function health(_req: express.Request, res: express.Response) {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ok',
      service: 'budgetbrain-web-api',
      version: env.API_VERSION,
      database: 'connected',
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'budgetbrain-web-api',
      database: 'disconnected',
    });
  }
}

app.get(['/health', '/web/health'], health);
registerApiIndex(app, 'web', env.API_VERSION);
registerApiAliases(app, 'web', env.API_VERSION, registerWebRoutes);

app.use(jsonNotFound);
app.use(errorHandler);

export default app;
