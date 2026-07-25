import app from './app';
import { connectDatabase } from '../db/database';
import { initModels, sequelize } from '../models';
import { env } from './shared/config/env';
import { initSentry } from './shared/config/sentry';
import { validateProductionConfig } from './shared/config/production';

initSentry();
validateProductionConfig();

async function bootstrap() {
  try {
    const dbConnected = await connectDatabase();
    initModels();

    if (dbConnected) {
      if (env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('[web] Database synced (development)');
      } else {
        console.log('[web] Production mode — run npm run db:migrate before deploy');
      }

    } else {
      console.warn('[web] Starting without database — DB-dependent routes will not work until connected');
    }

    app.listen(env.PORT, () => {
      console.log(`[web] BudgetBrain API running on port ${env.PORT}`);
      console.log(`[web] Environment: ${env.NODE_ENV}`);
      console.log(`[web] API: http://localhost:${env.PORT}/api/${env.API_VERSION}`);
    });
  } catch (error) {
    console.error('[web] Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
