import app from './app';
import { initModels } from '@database/models';
import { prepareDatabase, listenAndLog, setupGracefulShutdown } from '../shared/startup';
import { env } from './shared/config/env';
import { initSentry } from '@config/sentry';
import { validateProductionConfig } from '@config/production';
import { createLogger } from '../shared/logging';

const log = createLogger('admin');

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    initModels();
    await prepareDatabase(log);

    const server = listenAndLog(app, log, 'admin', {
      port: env.PORT,
      apiVersion: env.API_VERSION,
      environment: env.NODE_ENV,
    });

    setupGracefulShutdown(server, log, 'admin');
  } catch (error) {
    log.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

bootstrap();
