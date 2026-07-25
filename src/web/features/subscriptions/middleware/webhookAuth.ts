import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/utils/errors';
import { env } from '../../../shared/config/env';

/** RevenueCat webhook auth — Bearer secret, not user JWT. */
export function requireWebhookSecret(req: Request, _res: Response, next: NextFunction): void {
  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    if (env.NODE_ENV === 'production') {
      next(new AppError(503, 'Webhook not configured', 'WEBHOOK_NOT_CONFIGURED'));
      return;
    }
    next();
    return;
  }

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`) {
    next(new AppError(401, 'Invalid webhook secret', 'INVALID_WEBHOOK_SECRET'));
    return;
  }

  next();
}
