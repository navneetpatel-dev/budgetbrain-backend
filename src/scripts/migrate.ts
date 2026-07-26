import { existsSync } from 'fs';
import { QueryTypes } from 'sequelize';

const envFile = `.env.${process.env.NODE_ENV ?? 'production'}`;
if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Create it on the server with required secrets (see .env.example).`);
  process.exit(1);
}

/**
 * Remap legacy `category` period → `monthly` + keep category_id,
 * and replace enum values with monthly | weekly | custom.
 */
async function migrateBudgetTypeEnum(sequelize: Awaited<typeof import('../shared/models')>['sequelize']) {
  const dialect = sequelize.getDialect();
  if (dialect !== 'postgres') {
    console.log(`Skipping budget type enum migration (dialect=${dialect}).`);
    return;
  }

  const tableExists = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'budgets'
     ) AS exists`,
    { type: QueryTypes.SELECT }
  );
  if (!tableExists[0]?.exists) {
    console.log('Budgets table not found yet — enum migration deferred to sync.');
    return;
  }

  const enumName = 'enum_budgets_type';
  const exists = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = :enumName) AS exists`,
    { replacements: { enumName }, type: QueryTypes.SELECT }
  );
  if (!exists[0]?.exists) return;

  const labels = await sequelize.query<{ enumlabel: string }>(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = :enumName`,
    { replacements: { enumName }, type: QueryTypes.SELECT }
  );
  const set = new Set(labels.map((l) => l.enumlabel));
  if (set.has('custom') && !set.has('category')) {
    console.log(`Budget type enum ${enumName} already migrated.`);
    return;
  }

  console.log(`Migrating budget type enum ${enumName}…`);

  await sequelize.query(`UPDATE budgets SET type = 'monthly' WHERE type::text = 'category'`);

  await sequelize.query(`
    ALTER TABLE budgets ALTER COLUMN type DROP DEFAULT;
    ALTER TABLE budgets ALTER COLUMN type TYPE TEXT USING type::text;
    DROP TYPE "${enumName}";
    CREATE TYPE "${enumName}" AS ENUM ('monthly', 'weekly', 'custom');
    ALTER TABLE budgets
      ALTER COLUMN type TYPE "${enumName}"
      USING type::"${enumName}";
  `);
  console.log(`Budget type enum ${enumName} migrated.`);
}

async function migrate(): Promise<number> {
  const { connectDatabase } = await import('../shared/db/database');
  const connected = await connectDatabase();

  if (!connected) {
    console.log('Skipping migration — database unavailable');
    return 0;
  }

  const { initModels, sequelize } = await import('../shared/models');
  initModels();

  // Enum remap must run before sync so model ENUM matches DB
  await migrateBudgetTypeEnum(sequelize);

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
