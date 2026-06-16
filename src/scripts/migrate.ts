import { existsSync } from 'fs';

const envFile = `.env.${process.env.NODE_ENV ?? 'production'}`;
if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Create it on the server with required secrets (see .env.example).`);
  process.exit(1);
}

async function migrate() {
  const { connectDatabase } = await import('../config/database');

  const connected = await connectDatabase();
  if (!connected) {
    console.warn('Skipping migration — database unavailable');
    return;
  }

  const { initModels, sequelize } = await import('../models');
  initModels();
  await sequelize.sync({ alter: false });
  console.log('Database migration complete (schema synced).');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
