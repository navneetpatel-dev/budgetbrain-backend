import { Response, NextFunction } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError } from '@shared/errors';
import { getEntitlementForUser } from '@shared/modules/subscriptions';

export function requireEntitlement(entitlementId = 'pro') {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.userId) {
        throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
      }

      if (req.user.role === 'admin' || req.user.role === 'lifetime') {
        next();
        return;
      }

      const entitlement = await getEntitlementForUser(req.userId, entitlementId);
      if (!entitlement.isEntitled) {
        throw new AppError(402, 'Active subscription required for this feature', 'ENTITLEMENT_REQUIRED');
      }

      (req as any).subscription = entitlement;
      next();
    } catch (err) {
      next(err);
    }
  };
}
