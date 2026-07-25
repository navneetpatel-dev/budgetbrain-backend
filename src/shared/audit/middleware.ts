import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AuditSource } from './actions';
import { getAuditContext, runWithAuditContext, setAuditActor } from './context';

export function createRequestContextMiddleware(source: AuditSource) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId =
      (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id']) ||
      randomUUID();

    res.setHeader('X-Request-Id', requestId);

    const ipAddress =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : null) ||
      req.ip ||
      req.socket.remoteAddress ||
      null;

    runWithAuditContext(
      {
        requestId,
        source,
        ipAddress,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        actorUserId: null,
        actorType: source === 'admin' ? 'admin' : 'user',
      },
      () => next()
    );
  };
}

/** Call after auth middleware so actor is attached to the audit context. */
export function attachAuditActor(req: Request, _res: Response, next: NextFunction): void {
  const userId = (req as Request & { userId?: string }).userId ?? null;
  const ctx = getAuditContext();
  if (userId && ctx) {
    setAuditActor(userId, ctx.source === 'admin' ? 'admin' : 'user');
  }
  next();
}
