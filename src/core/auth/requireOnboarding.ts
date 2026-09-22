import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError } from '@shared/errors';
import { hasPermission, Permissions } from '@core/permissions/permissions';

export function requireOnboarding(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    return;
  }
  if (hasPermission(req.user.role, Permissions.ONBOARDING_BYPASS)) {
    next();
    return;
  }
  if (!req.user.onboardingCompleted) {
    next(new AppError(403, 'Please complete your profile to access this feature', 'ONBOARDING_REQUIRED'));
    return;
  }
  next();
}
