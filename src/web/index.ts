import app from './app';
import { initModels } from '@database/models';
import { prepareDatabase, listenAndLog } from '../shared/startup';
import { env } from './shared/config/env';
import { initSentry } from '@config/sentry';
import { validateProductionConfig } from '@config/production';
import { createLogger } from '../shared/logging';
import { start } from '@jobs/index';

const log = createLogger('web');

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    initModels();
    const dbConnected = await prepareDatabase(log);
    if (dbConnected && process.env.ENABLE_CRON === 'true') {
      start();
    }

    listenAndLog(app, log, 'web', {
      port: env.PORT,
      apiVersion: env.API_VERSION,
      environment: env.NODE_ENV,
    });
  } catch (error) {
    log.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

bootstrap();
