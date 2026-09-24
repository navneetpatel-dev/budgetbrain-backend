import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { detectionSyncRateLimiter } from '@core/middleware/rateLimit';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './transactionDetection.controller';
import {
  confirmDetectedTransactionSchema,
  createMerchantRuleSchema,
  detectionSettingsSchema,
  knowledgePackQuerySchema,
  listDetectedQuerySchema,
  syncDetectedBatchSchema,
} from '@shared/modules/transaction-detection/transactionDetection.validator';

const router = Router();

// Kill switches and the user's auto-add preference (T1.16, T1.5)
router.get('/config', asyncHandler(controller.getConfig));
router.patch('/settings', validateBody(detectionSettingsSchema), asyncHandler(controller.updateSettings));

// Signed knowledge pack download info, with ETag/304 (T4.3)
router.get('/knowledge-pack', validateQuery(knowledgePackQuerySchema), asyncHandler(controller.getKnowledgePack));

// Watermark for catch-up scans and fresh installs
router.get('/sync-state', asyncHandler(controller.getSyncState));

// Batch sync of normalized detected transactions (never raw messages)
router.post('/sync', detectionSyncRateLimiter, validateBody(syncDetectedBatchSchema), asyncHandler(controller.syncBatch));

// Detected list (auto-added, transfers, confirmed…) and the review inbox
router.get('/', validateQuery(listDetectedQuerySchema), asyncHandler(controller.listDetected));
router.get('/pending', validateQuery(paginationSchema), asyncHandler(controller.listPending));

// Review actions
router.post(
  '/pending/:id/confirm',
  validateParams(uuidParamSchema),
  validateBody(confirmDetectedTransactionSchema),
  asyncHandler(controller.confirmPending)
);
router.post('/pending/:id/reject', validateParams(uuidParamSchema), asyncHandler(controller.rejectPending));
// Delete a review item: kept as rejected so the same message can't be detected again
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.rejectPending));
// Undo an auto-added or confirmed item (deletes its transaction, restores the balance)
router.post('/:id/undo', validateParams(uuidParamSchema), asyncHandler(controller.undoDetected));

// Learned merchant rules
router.get('/rules', asyncHandler(controller.getMerchantRules));
router.post('/rules', validateBody(createMerchantRuleSchema), asyncHandler(controller.saveMerchantRule));

export default router;
