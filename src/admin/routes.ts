import adminRoutes from './features/admin/route';
import type { Express } from 'express';

/** Admin platform routes. Shared /auth is mounted by registerWebRoutes. */
export function registerAdminRoutes(app: Express, apiPrefix: string): void {
  app.use(`${apiPrefix}/admin`, adminRoutes);
}
