import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { integrationsRateLimiter } from '@core/middleware/rateLimit';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './transactionDetection.controller';
import {
  confirmDetectedTransactionSchema,
  createMerchantRuleSchema,
  syncDetectedBatchSchema,
} from '@shared/modules/transaction-detection/transactionDetection.validator';

const router = Router();

// 1. Watermark sync-state endpoint (for fresh installs, catch-up scans, and status checks)
router.get('/sync-state', asyncHandler(controller.getSyncState));

// 2. Batch sync normalized detected transactions (protected by rate limiter)
router.post(
  '/sync',
  integrationsRateLimiter,
  validateBody(syncDetectedBatchSchema),
  asyncHandler(controller.syncBatch)
);

// 3. Pending review list
router.get('/pending', validateQuery(paginationSchema), asyncHandler(controller.listPending));

// 4. Confirm a pending review item
router.post(
  '/pending/:id/confirm',
  validateParams(uuidParamSchema),
  validateBody(confirmDetectedTransactionSchema),
  asyncHandler(controller.confirmPending)
);

// 5. Reject/ignore a pending review item
router.post(
  '/pending/:id/reject',
  validateParams(uuidParamSchema),
  asyncHandler(controller.rejectPending)
);

// 6. Learned merchant rules
router.get('/rules', asyncHandler(controller.getMerchantRules));
router.post('/rules', validateBody(createMerchantRuleSchema), asyncHandler(controller.saveMerchantRule));

export default router;
