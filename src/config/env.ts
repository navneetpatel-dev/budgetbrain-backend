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
dotenv.config({ path: '.env.local' });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_VERSION: z.string().default('v1'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('budgetbrain'),
  DB_USER: z.string().default('budgetbrain'),
  DB_PASSWORD: z.string().default('budgetbrain'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('BudgetBrain <noreply@budgetbrain.app>'),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('budgetbrain-receipts'),
  OPENAI_API_KEY: z.string().optional(),
  AI_FREE_MONTHLY_TOKEN_LIMIT: z.coerce.number().default(20000),
  AI_PRO_MONTHLY_TOKEN_LIMIT: z.coerce.number().default(200000),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  CLOUDFRONT_DOMAIN: z.string().optional(),
  EXCHANGE_RATE_API_KEY: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_ID_MONTHLY: z.string().optional(),
  RAZORPAY_PLAN_ID_YEARLY: z.string().optional(),
  APP_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('*'),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // Set 'true' on exactly one deployed instance — BullMQ workers should have a single
  // consumer per queue set, not one per app process. See src/queue/index.ts.
  ENABLE_QUEUE_WORKERS: z.string().optional(),
  // Automatic transaction detection kill switches (implementation plan T1.16). 'false' turns
  // detection off entirely, or only its automatic adding (everything then waits for review).
  DETECTION_ENABLED: z.enum(['true', 'false']).default('true'),
  DETECTION_AUTO_CREATE_ENABLED: z.enum(['true', 'false']).default('true'),
  // Oldest mobile app version allowed to run detection, e.g. '1.4.0'.
  DETECTION_MIN_APP_VERSION: z.string().optional(),
});

export const env = envSchema.parse(process.env);
