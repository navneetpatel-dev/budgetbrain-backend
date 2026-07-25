/**
 * Hoist Sequelize models to src/models with a single src/db connection.
 * Platforms keep private shared/ for middleware/utils/config, but import models from src/models.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');
const PLATFORMS = ['mobile', 'web', 'admin'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function writeDbLayer() {
  const dbDir = path.join(SRC, 'db');
  fs.mkdirSync(dbDir, { recursive: true });

  // Minimal env for DB connection (platforms keep their own env for PORT/CORS/etc.)
  fs.writeFileSync(
    path.join(dbDir, 'env.ts'),
    `import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFileByEnvironment: Record<string, string> = {
  development: '.env.development',
  test: '.env.test',
  staging: '.env.staging',
  production: '.env.production',
};

dotenv.config({ path: envFileByEnvironment[nodeEnv] ?? '.env.local' });
dotenv.config({ path: '.env.local' });

const dbEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('budgetbrain'),
  DB_USER: z.string().default('budgetbrain'),
  DB_PASSWORD: z.string().default('budgetbrain'),
});

export const dbEnv = dbEnvSchema.parse(process.env);
`
  );

  fs.writeFileSync(
    path.join(dbDir, 'database.ts'),
    `import { Sequelize } from 'sequelize';
import { dbEnv } from './env';

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);

function usesRemoteDatabase(): boolean {
  return !LOCAL_DB_HOSTS.has(dbEnv.DB_HOST);
}

const sequelizeOptions = {
  dialect: 'postgres' as const,
  logging: dbEnv.NODE_ENV === 'development' ? console.log : false,
  define: {
    underscored: true,
    timestamps: true,
  },
  ...(usesRemoteDatabase()
    ? {
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
      }
    : {}),
};

export const sequelize = new Sequelize(dbEnv.DB_NAME, dbEnv.DB_USER, dbEnv.DB_PASSWORD, {
  host: dbEnv.DB_HOST,
  port: dbEnv.DB_PORT,
  ...sequelizeOptions,
});

export async function connectDatabase(): Promise<boolean> {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(\`Database connection failed: \${message}\`);
    return false;
  }
}
`
  );
}

function hoistModels() {
  const source = path.join(SRC, 'mobile', 'shared', 'models');
  const dest = path.join(SRC, 'models');
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(source, dest);

  const indexPath = path.join(dest, 'index.ts');
  let index = fs.readFileSync(indexPath, 'utf8');
  index = index.replace(
    /import \{ sequelize \} from '\.\.\/config\/database';/,
    `import { sequelize } from '../db/database';`
  );
  fs.writeFileSync(indexPath, index);
}

function relToModels(fromFile) {
  let rel = path.relative(path.dirname(fromFile), path.join(SRC, 'models')).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function relToDb(fromFile) {
  let rel = path.relative(path.dirname(fromFile), path.join(SRC, 'db')).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function rewriteImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const orig = content;
  const modelsPrefix = relToModels(filePath);
  const dbPrefix = relToDb(filePath);

  // shared/models → root models
  content = content.replace(
    /from ['"]((?:\.\.\/)+)shared\/models(\/[^'"]*)?['"]/g,
    (_m, _d, sub) => `from '${modelsPrefix}${sub || ''}'`
  );
  content = content.replace(
    /import\(['"]((?:\.\.\/)+)shared\/models(\/[^'"]*)?['"]\)/g,
    (_m, _d, sub) => `import('${modelsPrefix}${sub || ''}')`
  );

  // platform shared/types importing from '../models'
  if (filePath.includes(`${path.sep}shared${path.sep}types${path.sep}`)) {
    content = content.replace(
      /from ['"]\.\.\/models['"]/g,
      `from '${modelsPrefix}'`
    );
  }

  // platform shared/middleware or services importing from '../models'
  if (
    filePath.includes(`${path.sep}shared${path.sep}middleware${path.sep}`) ||
    filePath.includes(`${path.sep}shared${path.sep}services${path.sep}`)
  ) {
    content = content.replace(
      /from ['"]\.\.\/models(\/[^'"]*)?['"]/g,
      (_m, sub) => `from '${modelsPrefix}${sub || ''}'`
    );
  }

  // connectDatabase / sequelize from platform shared/config/database → src/db
  content = content.replace(
    /from ['"]((?:\.\.\/)*|\.\/)shared\/config\/database['"]/g,
    `from '${dbPrefix}/database'`
  );
  content = content.replace(
    /from ['"]\.\/shared\/config\/database['"]/g,
    `from '${dbPrefix}/database'`
  );

  // index.ts style: from './shared/config/database'
  if (filePath.endsWith(`${path.sep}index.ts`) || filePath.endsWith(`${path.sep}app.ts`)) {
    content = content.replace(
      /from ['"]\.\/shared\/config\/database['"]/g,
      `from '${dbPrefix}/database'`
    );
    content = content.replace(
      /from ['"]\.\/shared\/models['"]/g,
      `from '${modelsPrefix}'`
    );
  }

  if (content !== orig) fs.writeFileSync(filePath, content);
}

function updatePlatformBootstraps() {
  for (const platform of PLATFORMS) {
    const indexPath = path.join(SRC, platform, 'index.ts');
    let index = fs.readFileSync(indexPath, 'utf8');
    index = index.replace(
      /import \{ connectDatabase \} from ['"][^'"]+['"];/,
      `import { connectDatabase } from '../db/database';`
    );
    index = index.replace(
      /import \{ initModels, sequelize \} from ['"][^'"]+['"];/,
      `import { initModels, sequelize } from '../models';`
    );
    fs.writeFileSync(indexPath, index);

    const appPath = path.join(SRC, platform, 'app.ts');
    let app = fs.readFileSync(appPath, 'utf8');
    app = app.replace(
      /import \{ sequelize \} from ['"][^'"]*models['"];/,
      `import { sequelize } from '../models';`
    );
    fs.writeFileSync(appPath, app);
  }
}

function updateScripts() {
  for (const name of ['migrate.ts', 'seed.ts']) {
    const p = path.join(SRC, 'scripts', name);
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, 'utf8');
    content = content
      .replace(/from ['"]\.\.\/mobile\/shared\/config\/database['"]/g, `from '../db/database'`)
      .replace(/from ['"]\.\.\/mobile\/shared\/models(\/[^'"]*)?['"]/g, (_m, sub) => `from '../models${sub || ''}'`)
      .replace(/import\(['"]\.\.\/mobile\/shared\/config\/database['"]\)/g, `import('../db/database')`)
      .replace(/import\(['"]\.\.\/mobile\/shared\/models['"]\)/g, `import('../models')`)
      .replace(/from ['"]\.\.\/mobile\/shared\/utils\/jwt['"]/g, `from '../mobile/shared/utils/jwt'`)
      .replace(/from ['"]\.\.\/mobile\/shared\/config\/env['"]/g, `from '../mobile/shared/config/env'`);
    fs.writeFileSync(p, content);
  }
}

function removePlatformModels() {
  for (const platform of PLATFORMS) {
    fs.rmSync(path.join(SRC, platform, 'shared', 'models'), { recursive: true, force: true });
    // Replace platform database.ts with re-export for any leftover imports
    fs.writeFileSync(
      path.join(SRC, platform, 'shared', 'config', 'database.ts'),
      `export { sequelize, connectDatabase } from '../../../db/database';\n`
    );
  }
}

function main() {
  console.log('Writing src/db...');
  writeDbLayer();

  console.log('Hoisting models to src/models...');
  hoistModels();

  console.log('Rewriting imports...');
  for (const file of walk(SRC)) {
    if (file.includes(`${path.sep}models${path.sep}`) && !file.endsWith(`${path.sep}models${path.sep}index.ts`)) {
      // individual model files don't import shared/models
      continue;
    }
    rewriteImports(file);
  }

  updatePlatformBootstraps();
  updateScripts();

  // Second pass rewrite for anything still pointing at shared/models
  for (const file of walk(SRC)) {
    rewriteImports(file);
  }

  console.log('Removing per-platform models...');
  removePlatformModels();

  console.log('Done.');
}

main();
