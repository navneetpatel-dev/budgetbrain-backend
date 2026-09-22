import dotenv from 'dotenv';
import { z } from 'zod';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFileByEnvironment: Record<string, string> = {
  development: '.env.development',
  test: '.env.test',
  staging: '.env.staging',
  production: '.env.production',
};

dotenv.config({ path: envFileByEnvironment[nodeEnv] ?? '.env.local' });
if (nodeEnv !== 'production') {
  dotenv.config({ path: '.env.local' });
}

const dbEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('budgetbrain'),
  DB_USER: z.string().default('budgetbrain'),
  DB_PASSWORD: z.string().default('budgetbrain'),
  DB_POOL_MAX: z.coerce.number().default(10),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_ACQUIRE_MS: z.coerce.number().default(30000),
  DB_POOL_IDLE_MS: z.coerce.number().default(10000),
});

export const dbEnv = dbEnvSchema.parse(process.env);
