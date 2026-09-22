import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@shared/types';
import { setAuditActor } from '@shared/audit';
import { resolveAuthenticatedUser } from '@core/auth/authenticate';

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await resolveAuthenticatedUser(req);
    req.user = user;
    req.userId = user.id;
    setAuditActor(user.id, 'admin');
    next();
  } catch (err) {
    next(err);
  }
}

export { requireAdmin } from '@core/auth/requireAdmin';
