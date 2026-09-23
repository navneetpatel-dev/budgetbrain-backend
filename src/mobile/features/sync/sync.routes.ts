import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody } from '@core/middleware/validate';
import { syncBatchRateLimiter } from '@core/middleware/rateLimit';
import * as controller from './sync.controller';
import { syncBatchSchema } from '@shared/modules/sync/validator/sync.validation';

const router = Router();
router.use(authenticate);

router.post(
  '/batch',
  syncBatchRateLimiter,
  validateBody(syncBatchSchema),
  asyncHandler(controller.processBatch)
);

export default router;
