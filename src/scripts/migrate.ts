import { connectDatabase } from '../config/database';
import { initModels, sequelize } from '../models';

async function migrate() {
  await connectDatabase();
  initModels();
  await sequelize.sync({ alter: false });
  console.log('Database migration complete (schema synced).');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
