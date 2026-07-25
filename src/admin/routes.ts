import authRoutes from './features/auth/route';
import adminRoutes from './features/admin/route';
import type { Express } from 'express';

export function registerAdminRoutes(app: Express, apiPrefix: string): void {
  app.use(`${apiPrefix}/auth`, authRoutes);
  app.use(`${apiPrefix}/admin`, adminRoutes);
}
