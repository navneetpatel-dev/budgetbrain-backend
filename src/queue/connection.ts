import type { ConnectionOptions } from 'bullmq';
import { env } from '@config/env';

/**
 * BullMQ requires its own ioredis-compatible connection options (notably
 * maxRetriesPerRequest: null) — distinct from @core/cache/redis.client's
 * instance, which is tuned for fast-fail cache reads instead.
 */
export const queueConnection: ConnectionOptions = env.REDIS_URL
  ? { url: env.REDIS_URL, maxRetriesPerRequest: null }
  : {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    };
