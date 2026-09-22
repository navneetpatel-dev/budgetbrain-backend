import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateQuery } from '@core/middleware/validate';
import { reportQuerySchema } from '@shared/modules/reports/reports.validator';
import { requireEntitlement } from '@shared/middleware/requireEntitlement';
import * as controller from './reports.controller';

const router = Router();
router.use(authenticate);

router.get('/csv', validateQuery(reportQuerySchema), asyncHandler(controller.exportCsv));
router.get('/pdf', requireEntitlement('pro'), validateQuery(reportQuerySchema), asyncHandler(controller.exportPdf));
router.get('/excel', requireEntitlement('pro'), validateQuery(reportQuerySchema), asyncHandler(controller.exportExcel));
router.get('/recap', asyncHandler(controller.getRecap));

export default router;
