import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateParams } from '@core/middleware/validate';
import { receiptUploadRateLimiter } from '@core/middleware/rateLimit';
import { uuidParamSchema } from '../../../shared/validation';
import { upload } from '@core/middleware/upload';
import * as controller from '../controller/attachments.controller';
import { attachmentParamsSchema } from '@shared/modules/expenses/expenses.validator';

const router = Router();
router.use(authenticate);

router.post(
  '/:id/attachments',
  receiptUploadRateLimiter,
  validateParams(uuidParamSchema),
  upload.single('receipt'),
  asyncHandler(controller.createAttachment)
);
router.get(
  '/:id/attachments',
  validateParams(uuidParamSchema),
  asyncHandler(controller.listAttachments)
);
router.get(
  '/:id/attachments/:attachmentId',
  validateParams(attachmentParamsSchema),
  asyncHandler(controller.getAttachment)
);
router.get(
  '/:id/attachments/:attachmentId/suggestion',
  validateParams(attachmentParamsSchema),
  asyncHandler(controller.getAttachmentSuggestion)
);
router.delete(
  '/:id/attachments/:attachmentId',
  validateParams(attachmentParamsSchema),
  asyncHandler(controller.deleteAttachment)
);

export default router;
