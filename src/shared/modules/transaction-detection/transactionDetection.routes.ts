import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { detectionIngestRateLimiter, detectionSyncRateLimiter } from '@core/middleware/rateLimit';
import { z } from 'zod';
import { paginationSchema, uuidField } from '@shared/validation/index';
import { uploadStatement } from '@core/middleware/upload';
import * as importController from '@modules/statement-import/statementImport.controller';
import * as controller from './transactionDetection.controller';
import {
  confirmDetectedTransactionSchema,
  createMerchantRuleSchema,
  detectionSettingsSchema,
  diagnosticsUploadSchema,
  ingestMessageSchema,
  knowledgePackQuerySchema,
  listDetectedQuerySchema,
  skeletonUploadSchema,
  syncDetectedBatchSchema,
  updateMerchantRuleSchema,
} from './transactionDetection.validator';

const uuidParamSchema = z.object({ id: uuidField() });

/**
 * Detection routes, mounted by both the mobile and the web API (plan T6.1) with the same
 * controllers, validators and rate limits.
 */
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

// Pasted SMS and forwarded emails, parsed on the server and never stored (T6.2)
router.get('/institutions', asyncHandler(controller.listInstitutions));
router.post('/ingest', detectionIngestRateLimiter, validateBody(ingestMessageSchema), asyncHandler(controller.ingest));

// Statement files: preview first, then import (T6.5). The file is deleted after each request.
router.post('/import/preview', detectionIngestRateLimiter, uploadStatement.single('file'), asyncHandler(importController.preview));
router.post('/import', detectionIngestRateLimiter, uploadStatement.single('file'), asyncHandler(importController.commit));

// Detected list (auto-added, transfers, confirmed…) and the review inbox
router.get('/', validateQuery(listDetectedQuerySchema), asyncHandler(controller.listDetected));
router.get('/pending', validateQuery(paginationSchema), asyncHandler(controller.listPending));

// "Delete my detected data" (T5.7) and export (T7.6). Registered before '/:id' so "me" is never read as an id.
router.delete('/me', asyncHandler(controller.deleteMyDetectedData));
router.get('/me/export', asyncHandler(controller.exportMyDetectedData));

// Daily diagnostics counts (T7.1) and opt-in template learning (T7.4)
router.post('/diagnostics', detectionSyncRateLimiter, validateBody(diagnosticsUploadSchema), asyncHandler(controller.uploadDiagnostics));
router.post('/skeletons', detectionSyncRateLimiter, validateBody(skeletonUploadSchema), asyncHandler(controller.uploadSkeletons));

// Learned merchant rules. Registered before '/:id' so "rules" is never read as an id.
router.get('/rules', asyncHandler(controller.getMerchantRules));
router.post('/rules', validateBody(createMerchantRuleSchema), asyncHandler(controller.saveMerchantRule));
router.delete('/rules', asyncHandler(controller.deleteMerchantRules));
router.patch('/rules/:id', validateParams(uuidParamSchema), validateBody(updateMerchantRuleSchema), asyncHandler(controller.updateMerchantRule));
router.delete('/rules/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteMerchantRule));

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

export default router;
