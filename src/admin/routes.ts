import authRoutes from './features/auth/auth.routes';
import adminRoutes from './features/admin/admin.routes';
import detectionAdminRoutes from './features/detection/detection.routes';
import type { Express } from 'express';

export function registerAdminRoutes(app: Express, apiPrefix: string): void {
  app.use(`${apiPrefix}/auth`, authRoutes);
  // Registered first: '/admin/detection/…' must not fall into the general admin router.
  app.use(`${apiPrefix}/admin/detection`, detectionAdminRoutes);
  app.use(`${apiPrefix}/admin`, adminRoutes);
}
