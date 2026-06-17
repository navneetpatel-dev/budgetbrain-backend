import { existsSync } from 'fs';

const envFile = `.env.${process.env.NODE_ENV ?? 'production'}`;
if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Create it on the server with required secrets (see .env.example).`);
  process.exit(1);
}

async function migrate(): Promise<number> {
  const { connectDatabase } = await import('../config/database');
  const connected = await connectDatabase();

  if (!connected) {
    console.log('Skipping migration — database unavailable');
    return 0;
  }

  const { initModels, sequelize } = await import('../models');
  initModels();
  await sequelize.sync({ alter: false });
  console.log('Database migration complete (schema synced).');
  await sequelize.close();
  return 0;
}

migrate()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
