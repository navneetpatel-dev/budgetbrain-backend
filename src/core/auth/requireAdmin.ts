import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError } from '@shared/errors';
import { hasPermission, Permissions } from '@core/permissions/permissions';

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!hasPermission(req.user?.role, Permissions.ADMIN_ACCESS)) {
    next(new AppError(403, 'Admin access required', 'ADMIN_REQUIRED'));
    return;
  }
  next();
}
