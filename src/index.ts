import app from './app';
import { connectDatabase } from './shared/config/database';
import { initModels, sequelize } from './shared/models';
import { env } from './shared/config/env';
import { initSentry } from './shared/config/sentry';
import { validateProductionConfig } from './shared/config/production';
import { startScheduledJobs } from './mobile/features/notifications/service/scheduledJobs.service';

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    const dbConnected = await connectDatabase();
    initModels();

    if (dbConnected) {
      if (env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('Database synced (development)');
      } else {
        console.log('Production mode — run npm run db:migrate before deploy');
      }

      startScheduledJobs();
    } else {
      console.warn('Starting without database — DB-dependent routes will not work until connected');
    }

    app.listen(env.PORT, () => {
      console.log('Database connected');
      console.log(`BudgetBrain API running on port ${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`API: http://localhost:${env.PORT}/api/${env.API_VERSION}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
