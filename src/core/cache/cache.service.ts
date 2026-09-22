import { redis } from './redis.client';
import { createLogger } from '@shared/logging';

const log = createLogger('system');

/**
 * Every method here is fail-open: a Redis error or timeout is logged and treated
 * as a cache miss, never surfaced to the caller. Caching must never be why a
 * request fails — mirrors the fallback pattern in currency.engine.ts.
 */

export async function getCache<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn('Cache read failed', { key, message: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    log.warn('Cache write failed', { key, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.unlink(key);
  } catch (err) {
    log.warn('Cache delete failed', { key, message: err instanceof Error ? err.message : String(err) });
  }
}

/** Non-blocking prefix invalidation: SCAN + UNLINK, never KEYS. */
export async function deleteCacheByPrefix(prefix: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    log.warn('Cache prefix delete failed', {
      prefix,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== undefined) return cached;

  const value = await loader();
  void setCache(key, value, ttlSeconds);
  return value;
}
