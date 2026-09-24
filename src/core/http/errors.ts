import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger, type LogService } from '@shared/logging';
import { getAuditContext } from '@shared/audit';
import { AppError, ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '@shared/errors';

export { AppError, ValidationError, NotFoundError, ForbiddenError, UnauthorizedError };

export function createErrorHandler(appName: LogService) {
  const log = createLogger(appName);

  return function errorHandler(
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

    // express.json() parse errors: the message quotes the start of the raw body (a pasted
    // message, say), so it is neither logged nor echoed (plan T9.4).
    const bodyError = err as Error & { type?: string; status?: number };
    if (bodyError.type === 'entity.parse.failed') {
      res.status(400).json({
        success: false,
        error: { message: 'The request body is not valid JSON', code: 'INVALID_JSON' },
        ...(requestId ? { requestId } : {}),
      });
      return;
    }
    if (bodyError.type === 'entity.too.large') {
      res.status(413).json({
        success: false,
        error: { message: 'The request body is too large', code: 'PAYLOAD_TOO_LARGE' },
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
  };
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
