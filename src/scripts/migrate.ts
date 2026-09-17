import { existsSync } from 'fs';
import dotenv from 'dotenv';
import { QueryTypes } from 'sequelize';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFile = `.env.${nodeEnv}`;
if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Create it on the server with required secrets (see .env.example).`);
  process.exit(1);
}

dotenv.config({ path: envFile });

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

/**
 * Additive columns/enum values for the tags, merchant-memory, budget-rollover,
 * weekly-digest, subscription-tracker, and CSV-import features. `sequelize.sync({ alter: false })`
 * only creates missing tables — it never alters existing ones — so these run as raw SQL first.
 * Every statement is idempotent (`IF NOT EXISTS`) so re-running this script is always safe.
 */
async function addColumnIfTableExists(
  sequelize: Awaited<typeof import('../shared/models')>['sequelize'],
  tableName: string,
  columnDef: string
) {
  const [rows] = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = :tableName
     ) AS exists`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  if ((rows as any)?.exists || (rows as any)?.[0]?.exists) {
    await sequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS ${columnDef}`);
  }
}

async function migrateAdditiveColumnsAndEnums(sequelize: Awaited<typeof import('../shared/models')>['sequelize']) {
  const dialect = sequelize.getDialect();
  if (dialect !== 'postgres') {
    console.log(`Skipping additive column/enum migration (dialect=${dialect}).`);
    return;
  }

  console.log('Applying additive column/enum migrations…');

  await addColumnIfTableExists(sequelize, 'transactions', `tags TEXT[] DEFAULT '{}'`);
  await addColumnIfTableExists(sequelize, 'transactions', `recurring_series_id UUID`);
  await addColumnIfTableExists(sequelize, 'budgets', `rollover BOOLEAN DEFAULT false`);
  await addColumnIfTableExists(sequelize, 'users', `weekly_digest_opt_in BOOLEAN DEFAULT true`);

  await addColumnIfTableExists(sequelize, 'audit_logs', `actor_type VARCHAR(20) DEFAULT 'user'`);
  await addColumnIfTableExists(sequelize, 'audit_logs', `outcome VARCHAR(20) DEFAULT 'success'`);
  await addColumnIfTableExists(sequelize, 'audit_logs', `severity VARCHAR(20) DEFAULT 'info'`);
  await addColumnIfTableExists(sequelize, 'audit_logs', `source VARCHAR(20) DEFAULT 'system'`);
  await addColumnIfTableExists(sequelize, 'audit_logs', `request_id VARCHAR(64)`);
  await addColumnIfTableExists(sequelize, 'audit_logs', `before_state JSONB`);
  await addColumnIfTableExists(sequelize, 'audit_logs', `after_state JSONB`);

  // ALTER TYPE ... ADD VALUE must run as its own statement (not combined with other DDL).
  try {
    await sequelize.query(`ALTER TYPE enum_parsed_transactions_source ADD VALUE IF NOT EXISTS 'csv'`);
  } catch {}
  try {
    await sequelize.query(`ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'bill_due'`);
  } catch {}
  try {
    await sequelize.query(`ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'weekly_digest'`);
  } catch {}

  console.log('Additive column/enum migrations complete.');
}

async function migrate(): Promise<number> {
  const { connectDatabase } = await import('../shared/db/database');
  const { dbEnv } = await import('../shared/db/env');
  console.log(`Migrating ${dbEnv.DB_NAME} on ${dbEnv.DB_HOST}:${dbEnv.DB_PORT} (NODE_ENV=${dbEnv.NODE_ENV})`);

  const connected = await connectDatabase();

  if (!connected) {
    console.error(`Migration aborted — could not connect to ${dbEnv.DB_HOST}/${dbEnv.DB_NAME}`);
    return 1;
  }

  const { initModels, sequelize } = await import('../shared/models');
  initModels();

  // Enum remap must run before sync so model ENUM matches DB
  await migrateBudgetTypeEnum(sequelize);
  await migrateAdditiveColumnsAndEnums(sequelize);
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
