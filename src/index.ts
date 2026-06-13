import app from './app';
import { connectDatabase } from './config/database';
import { initModels, sequelize } from './models';
import { env } from './config/env';
import { initSentry } from './config/sentry';

initSentry();

async function bootstrap() {
  try {
    await connectDatabase();
    initModels();
    await sequelize.sync({ alter: env.NODE_ENV === 'development' });
    console.log('Database synced');

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
