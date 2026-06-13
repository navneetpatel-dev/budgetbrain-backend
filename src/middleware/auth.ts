import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/errors';
import { User } from '../models';

export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findByPk(payload.userId);
    if (!user) {
      throw new AppError(401, 'User not found', 'UNAUTHORIZED');
    }
    req.user = user;
    req.userId = user.id;
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token', 'UNAUTHORIZED');
  }
}

export function requirePremium(req: AuthRequest, _res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (!role || !['premium', 'lifetime', 'admin'].includes(role)) {
    throw new AppError(403, 'Premium subscription required', 'PREMIUM_REQUIRED');
  }
  next();
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED');
  }
  next();
}
