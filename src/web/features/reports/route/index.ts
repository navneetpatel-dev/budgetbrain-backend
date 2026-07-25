import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate, requirePremium } from '../../../shared/middleware/auth';
import { validateQuery } from '../../../shared/middleware/validate';
import { dateRangeSchema } from '../../../shared/validation';
import * as controller from '../controller/reports.controller';

const router = Router();
router.use(authenticate);

router.get('/csv', validateQuery(dateRangeSchema), asyncHandler(controller.exportCsv));
router.get(
  '/pdf',
  requirePremium,
  validateQuery(dateRangeSchema),
  asyncHandler(controller.exportPdf)
);

export default router;
