import Redis from 'ioredis';
import { env } from '@config/env';
import { createLogger } from '@shared/logging';

const log = createLogger('system');

export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL || env.REDIS_HOST);
}

function buildClient(): Redis {
  const client = env.REDIS_URL
    ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: false })
    : new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
      });

  // Cache reads/writes are fail-open (see cache.service.ts) — this listener exists
  // only to stop ioredis from crashing the process on an unhandled 'error' event
  // when Redis is unreachable; callers never see this, they just miss the cache.
  client.on('error', (err) => {
    log.warn('Redis client error', { message: err instanceof Error ? err.message : String(err) });
  });

  return client;
}

export const redis = buildClient();
