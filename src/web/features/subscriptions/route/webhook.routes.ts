import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { validateBody } from '../../../shared/middleware/validate';
import { requireWebhookSecret } from '../middleware/webhookAuth';
import { revenueCatWebhookSchema } from '../validator/webhook.validation';
import * as controller from '../controller/subscriptions.controller';

const router = Router();

router.post(
  '/',
  requireWebhookSecret,
  validateBody(revenueCatWebhookSchema),
  asyncHandler(controller.handleWebhook)
);

export default router;
