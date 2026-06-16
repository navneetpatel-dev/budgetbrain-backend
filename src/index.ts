import app from './app';
import { connectDatabase } from './config/database';
import { initModels, sequelize } from './models';
import { env } from './config/env';
import { initSentry } from './config/sentry';
import { validateProductionConfig } from './config/production';
import { startScheduledJobs } from './features/notifications/scheduledJobs.service';

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
      console.log(`ExpenseFlow API running on port ${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`API: http://localhost:${env.PORT}/api/${env.API_VERSION}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
