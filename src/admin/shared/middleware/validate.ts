import { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req.query);
    Object.defineProperty(req, 'query', {
      value: parsed,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.parse(req.params);
    Object.defineProperty(req, 'params', {
      value: parsed,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}
