import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../../../logging';
import { getAuditContext } from '../../../audit';

const log = createLogger('mobile');

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = getAuditContext()?.requestId;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      log.error(err.message, { code: err.code, requestId, stack: err.stack });
    }
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.errors[0];
    res.status(400).json({
      success: false,
      error: {
        message: first?.message ?? 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors,
      },
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  log.error('Unhandled error', {
    requestId,
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    success: false,
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    ...(requestId ? { requestId } : {}),
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function successResponse<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}
