import type { Request, Response } from 'express';
import type { Express } from 'express';

export function jsonNotFound(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { message: `Not found: ${_req.method} ${_req.path}`, code: 'NOT_FOUND' },
  });
}

export function registerApiAliases(
  app: Express,
  appName: 'web' | 'mobile' | 'admin',
  apiVersion: string,
  register: (app: Express, apiPrefix: string) => void
): void {
  const apiPrefix = `/api/${apiVersion}`;
  register(app, apiPrefix);
  register(app, `/${appName}${apiPrefix}`);
}
