import app from './app';
import { initModels } from '../shared/models';
import { prepareDatabase, listenAndLog } from '../shared/startup';
import { env } from './shared/config/env';
import { initSentry } from './shared/config/sentry';
import { validateProductionConfig } from './shared/config/production';
import { createLogger } from '../shared/logging';

const log = createLogger('admin');

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    initModels();
    await prepareDatabase(log);

    listenAndLog(app, log, 'admin', {
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
