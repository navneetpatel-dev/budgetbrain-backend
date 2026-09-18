import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import * as controller from '../controller/subscriptions.controller';

const router = Router();

router.post('/webhook', asyncHandler(controller.handleWebhook));
router.get('/status', authenticate, asyncHandler(controller.getStatus));
router.post('/razorpay/checkout', authenticate, asyncHandler(controller.createRazorpayCheckout));
router.post('/razorpay/webhook', asyncHandler(controller.handleRazorpayWebhook));

export default router;
