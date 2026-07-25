import syncRoutes from './features/sync/route';
import type { Express } from 'express';

/**
 * Mobile platform routes.
 * Shared user APIs are mounted from web (same paths; both clients use them).
 * Mobile keeps full feature copies under ./features for ownership / divergence.
 */
export function registerMobileRoutes(app: Express, apiPrefix: string): void {
  app.use(`${apiPrefix}/sync`, syncRoutes);
}
