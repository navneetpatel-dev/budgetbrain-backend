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

export const aiChatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, error: { message: 'Too many chat requests', code: 'RATE_LIMIT' } },
});

export const reportExportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { success: false, error: { message: 'Too many export requests', code: 'RATE_LIMIT' } },
});

export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: { message: 'Too many search requests', code: 'RATE_LIMIT' } },
});
