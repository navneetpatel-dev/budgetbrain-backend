import rateLimit, { type Store, type Options, type IncrementResponse } from 'express-rate-limit';
import { redis, isRedisEnabled } from '@core/cache/redis.client';

class RedisRateLimitStore implements Store {
  prefix: string;
  windowMs: number = 60000;

  constructor(options?: { prefix?: string }) {
    this.prefix = options?.prefix ?? 'rl:';
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const fullKey = `${this.prefix}${key}`;
    try {
      const results = await redis
        .pipeline()
        .incr(fullKey)
        .pttl(fullKey)
        .exec();

      if (!results) {
        return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
      }

      const totalHits = Number(results[0][1] ?? 1);
      let pttl = Number(results[1][1] ?? -1);

      if (pttl <= 0) {
        await redis.pexpire(fullKey, this.windowMs);
        pttl = this.windowMs;
      }

      return {
        totalHits,
        resetTime: new Date(Date.now() + pttl),
      };
    } catch {
      // Fail-open: on Redis error, treat as a single pass-through hit
      return {
        totalHits: 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await redis.decr(`${this.prefix}${key}`);
    } catch {}
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redis.del(`${this.prefix}${key}`);
    } catch {}
  }
}

function createLimiter(prefix: string, max: number, windowMs: number, message: string, code = 'RATE_LIMIT') {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: { message, code } },
    standardHeaders: true,
    legacyHeaders: false,
    store: isRedisEnabled() ? new RedisRateLimitStore({ prefix: `rl:${prefix}:` }) : undefined,
  });
}

export const globalRateLimiter = createLimiter('global', 1000, 15 * 60 * 1000, 'Too many requests');
export const authRateLimiter = createLimiter('auth', 20, 15 * 60 * 1000, 'Too many auth attempts');
export const aiChatRateLimiter = createLimiter('aichat', 15, 60 * 1000, 'Too many chat requests');
export const reportExportRateLimiter = createLimiter('export', 8, 60 * 1000, 'Too many export requests');
export const searchRateLimiter = createLimiter('search', 30, 60 * 1000, 'Too many search requests');
export const receiptUploadRateLimiter = createLimiter('receipt', 20, 60 * 1000, 'Too many upload requests');
export const syncBatchRateLimiter = createLimiter('sync', 10, 60 * 1000, 'Too many sync requests');
export const integrationsRateLimiter = createLimiter('integrations', 15, 60 * 1000, 'Too many import requests');
export const checkoutRateLimiter = createLimiter('checkout', 10, 60 * 1000, 'Too many checkout requests');

/**
 * Per-user limit for detected-transaction sync (implementation plan T1.7). Keyed by the
 * authenticated user rather than IP, so users behind one carrier NAT don't share a budget.
 * Clients send at most 100 items per request and batch live messages, so 60 requests a minute
 * leaves ample headroom for a burst of SMS or a historical scan.
 */
export const detectionSyncRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: { message: 'Too many detection sync requests', code: 'RATE_LIMIT' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as unknown as { userId?: string }).userId;
    return userId ? `user:${userId}` : `ip:${req.ip ?? 'unknown'}`;
  },
  store: isRedisEnabled() ? new RedisRateLimitStore({ prefix: 'rl:detect-sync:' }) : undefined,
});
