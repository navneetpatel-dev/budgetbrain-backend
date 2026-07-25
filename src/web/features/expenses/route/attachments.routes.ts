import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { validateParams } from '../../../../shared/middleware/validate';
import { uuidParamSchema } from '../../../../shared/validation';
import { upload } from '../../../../shared/middleware/upload';
import * as controller from '../controller/attachments.controller';
import { attachmentParamsSchema } from '../validator/transaction.validation';

const router = Router();
router.use(authenticate);

router.post(
  '/:id/attachments',
  validateParams(uuidParamSchema),
  upload.single('receipt'),
  asyncHandler(controller.createAttachment)
);
router.get(
  '/:id/attachments',
  validateParams(uuidParamSchema),
  asyncHandler(controller.listAttachments)
);
router.delete(
  '/:id/attachments/:attachmentId',
  validateParams(attachmentParamsSchema),
  asyncHandler(controller.deleteAttachment)
);

export default router;
