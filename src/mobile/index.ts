import app from './app';
import { initModels } from '@database/models';
import { prepareDatabase, listenAndLog, setupGracefulShutdown } from '../shared/startup';
import { env } from './shared/config/env';
import { initSentry } from '@config/sentry';
import { validateProductionConfig } from '@config/production';
import { start } from '@jobs/index';
import { createLogger } from '../shared/logging';

const log = createLogger('mobile');

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    initModels();

    const dbConnected = await prepareDatabase(log);

    if (dbConnected && process.env.ENABLE_CRON === 'true') {
      start();
    }

    const server = listenAndLog(app, log, 'mobile', {
      port: env.PORT,
      apiVersion: env.API_VERSION,
      environment: env.NODE_ENV,
    });

    setupGracefulShutdown(server, log, 'mobile', {
      stopJobsOnExit: process.env.ENABLE_CRON === 'true',
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
