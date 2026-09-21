import { existsSync, readdirSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { QueryTypes, Sequelize } from 'sequelize';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFile = `.env.${nodeEnv}`;
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
} else if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

interface MigrationRecord {
  name: string;
}

interface MigrationModule {
  up: (queryInterface: ReturnType<Sequelize['getQueryInterface']>, SequelizeClass: typeof Sequelize) => Promise<void>;
  down?: (queryInterface: ReturnType<Sequelize['getQueryInterface']>, SequelizeClass: typeof Sequelize) => Promise<void>;
}

async function ensureMigrationTable(sequelize: Sequelize): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(sequelize: Sequelize): Promise<Set<string>> {
  const rows = await sequelize.query<MigrationRecord>(
    `SELECT name FROM schema_migrations ORDER BY name ASC`,
    { type: QueryTypes.SELECT }
  );
  return new Set(rows.map((r) => r.name));
}

async function runMigrations(): Promise<number> {
  const { connectDatabase, sequelize } = await import('@database/config/database');
  const { dbEnv } = await import('@database/config/env');

  console.log(`\n========================================`);
  console.log(`Running database migrations for ${dbEnv.DB_NAME} on ${dbEnv.DB_HOST}:${dbEnv.DB_PORT} (NODE_ENV=${dbEnv.NODE_ENV})`);
  console.log(`========================================\n`);

  const connected = await connectDatabase();
  if (!connected) {
    console.error(`Migration aborted — could not connect to database.`);
    return 1;
  }

  try {
    await ensureMigrationTable(sequelize);
    const applied = await getAppliedMigrations(sequelize);

    const migrationsDir = [
      path.resolve(process.cwd(), 'database/migrations'),
      path.resolve(__dirname, '../../database/migrations'),
      path.resolve(__dirname, '../../../database/migrations'),
    ].find((dir) => existsSync(dir));
    if (!migrationsDir) {
      console.log(`No migrations directory found relative to cwd=${process.cwd()} or ${__dirname}`);
      return 0;
    }

    const files = readdirSync(migrationsDir)
      .filter((file) => /^\d+.*\.js$/.test(file))
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log(`All migrations are already up to date (${files.length} applied).`);
      return 0;
    }

    console.log(`Found ${pending.length} pending migration(s):`);
    for (const f of pending) {
      console.log(`  - ${f}`);
    }
    console.log('');

    const queryInterface = sequelize.getQueryInterface();
    const SequelizeClass = Sequelize;

    for (const migrationFile of pending) {
      console.log(`Applying migration: ${migrationFile}...`);
      const migrationPath = path.join(migrationsDir, migrationFile);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration: MigrationModule = require(migrationPath);

      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${migrationFile} does not export an up() function`);
      }

      await migration.up(queryInterface, SequelizeClass);
      await sequelize.query(
        `INSERT INTO schema_migrations (name, executed_at) VALUES (:name, NOW())`,
        { replacements: { name: migrationFile } }
      );
      console.log(`✓ Migration ${migrationFile} applied successfully.`);
    }

    console.log(`\nAll migrations applied successfully.`);
    return 0;
  } catch (error) {
    console.error('Migration failed:', error);
    return 1;
  } finally {
    await sequelize.close();
  }
}

runMigrations()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Migration runner error:', err);
    process.exit(1);
  });
