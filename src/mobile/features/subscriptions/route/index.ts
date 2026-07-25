import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { validateBody } from '../../../../shared/middleware/validate';
import * as controller from '../controller/subscriptions.controller';
import { restoreSubscriptionSchema } from '../validator/subscription.validation';

const router = Router();
router.use(authenticate);

router.post('/webhook', asyncHandler(controller.handleWebhook));
router.get('/status', asyncHandler(controller.getStatus));
router.post(
  '/restore',
  validateBody(restoreSubscriptionSchema),
  asyncHandler(controller.restore)
);

export default router;
