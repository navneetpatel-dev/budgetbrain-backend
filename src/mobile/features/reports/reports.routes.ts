import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateQuery, validateBody } from '@core/middleware/validate';
import { reportExportRateLimiter } from '@core/middleware/rateLimit';
import { reportQuerySchema, exportAsyncBodySchema } from '@shared/modules/reports/reports.validator';
import { requireEntitlement } from '@shared/middleware/requireEntitlement';
import * as controller from './reports.controller';

const router = Router();
router.use(authenticate);

router.get('/csv', validateQuery(reportQuerySchema), asyncHandler(controller.exportCsv));
router.get(
  '/pdf',
  reportExportRateLimiter,
  requireEntitlement('pro'),
  validateQuery(reportQuerySchema),
  asyncHandler(controller.exportPdf)
);
router.get(
  '/excel',
  reportExportRateLimiter,
  requireEntitlement('pro'),
  validateQuery(reportQuerySchema),
  asyncHandler(controller.exportExcel)
);
router.get('/recap', asyncHandler(controller.getRecap));

// Async export: entitlement is checked inline in the controller (format is in the body, not
// decidable at route-registration time the way the sync GET routes above are).
router.post(
  '/export-async',
  reportExportRateLimiter,
  validateBody(exportAsyncBodySchema),
  asyncHandler(controller.exportAsync)
);
router.get('/export-async/:jobId', asyncHandler(controller.getExportStatus));

export default router;
