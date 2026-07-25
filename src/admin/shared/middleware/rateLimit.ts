import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT' } },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { message: 'Too many auth attempts', code: 'RATE_LIMIT' } },
});
