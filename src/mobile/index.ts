import app from './app';
import { initModels } from '../shared/models';
import { prepareDatabase, listenAndLog } from '../shared/startup';
import { env } from './shared/config/env';
import { initSentry } from './shared/config/sentry';
import { validateProductionConfig } from './shared/config/production';
import { startScheduledJobs } from './features/notifications/service/scheduledJobs.service';
import { createLogger } from '../shared/logging';

const log = createLogger('mobile');

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    initModels();

    const dbConnected = await prepareDatabase(log);

    if (dbConnected) {
      startScheduledJobs();
    }

    listenAndLog(app, log, 'mobile', {
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
