import app from './app';
import { connectDatabase } from '../db/database';
import { initModels, sequelize } from '../models';
import { env } from './shared/config/env';
import { initSentry } from './shared/config/sentry';
import { validateProductionConfig } from './shared/config/production';
import { startScheduledJobs } from './features/notifications/service/scheduledJobs.service';

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    const dbConnected = await connectDatabase();
    initModels();

    if (dbConnected) {
      if (env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('[mobile] Database synced (development)');
      } else {
        console.log('[mobile] Production mode — run npm run db:migrate before deploy');
      }

      startScheduledJobs();
    } else {
      console.warn('[mobile] Starting without database — DB-dependent routes will not work until connected');
    }

    app.listen(env.PORT, () => {
      console.log(`[mobile] BudgetBrain API running on port ${env.PORT}`);
      console.log(`[mobile] Environment: ${env.NODE_ENV}`);
      console.log(`[mobile] API: http://localhost:${env.PORT}/api/${env.API_VERSION}`);
    });
  } catch (error) {
    console.error('[mobile] Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
