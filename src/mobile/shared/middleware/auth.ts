import type { AuthRequest } from '../types';
import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/errors';
import { User } from '@database/models';
import { setAuditActor } from '../../../shared/audit';

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
    req.user = user;
    req.userId = user.id;
    setAuditActor(user.id, user.role === 'admin' ? 'admin' : 'user');
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOnboarding(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    return;
  }
  if (req.user.role === 'admin') {
    next();
    return;
  }
  if (!req.user.onboardingCompleted) {
    next(new AppError(403, 'Please complete your profile to access this feature', 'ONBOARDING_REQUIRED'));
    return;
  }
  next();
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    next(new AppError(403, 'Admin access required', 'ADMIN_REQUIRED'));
    return;
  }
  next();
}
