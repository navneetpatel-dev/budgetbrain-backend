import authRoutes from './features/auth/auth.routes';
import adminRoutes from './features/admin/admin.routes';
import type { Express } from 'express';

export function registerAdminRoutes(app: Express, apiPrefix: string): void {
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/admin`, adminRoutes);
}
