import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import * as controller from './subscriptions.controller';

const router = Router();

router.get('/status', authenticate, asyncHandler(controller.getStatus));
router.post('/razorpay/checkout', authenticate, asyncHandler(controller.createRazorpayCheckout));
router.post('/razorpay/webhook', asyncHandler(controller.handleRazorpayWebhook));

export default router;
