import app from './app';
import { connectDatabase } from '../shared/db/database';
import { initModels, sequelize } from '../shared/models';
import { env } from './shared/config/env';
import { initSentry } from './shared/config/sentry';
import { validateProductionConfig } from './shared/config/production';
import { createLogger } from '../shared/logging';

const log = createLogger('web');

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    const dbConnected = await connectDatabase();
    initModels();

    if (dbConnected) {
      if (env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        log.info('Database synced (development)');
      } else {
        log.info('Production mode — run npm run db:migrate before deploy');
      }
    } else {
      log.warn('Starting without database — DB-dependent routes will not work until connected');
    }

    app.listen(env.PORT, () => {
      log.info('BudgetBrain API running', {
        port: env.PORT,
        environment: env.NODE_ENV,
        api: `http://localhost:${env.PORT}/api/${env.API_VERSION}`,
      });
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
