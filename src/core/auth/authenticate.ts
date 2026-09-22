import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@shared/types';
import { User } from '@database/models';
import { setAuditActor } from '@shared/audit';
import { AppError } from '@shared/errors';
import { hasPermission, Permissions } from '@core/permissions/permissions';
import { verifyAccessToken } from './jwt';

export async function resolveAuthenticatedUser(req: AuthRequest): Promise<User> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError(401, 'Invalid or expired token', 'UNAUTHORIZED');
  }

  const user = await User.findByPk(payload.userId);
  if (!user) {
    throw new AppError(401, 'User not found', 'UNAUTHORIZED');
  }
  if (user.isSuspended) {
    throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
  }
  return user;
}

/** Mobile and web: reuse an already-attached user, and record an admin or user audit actor. */
export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user && req.userId) {
      next();
      return;
    }

    const user = await resolveAuthenticatedUser(req);
    req.user = user;
    req.userId = user.id;
    setAuditActor(user.id, hasPermission(user.role, Permissions.ADMIN_ACCESS) ? 'admin' : 'user');
    next();
  } catch (err) {
    next(err);
  }
}
