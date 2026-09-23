import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { checkoutRateLimiter } from '@core/middleware/rateLimit';
import * as controller from './subscriptions.controller';

const router = Router();

router.get('/status', authenticate, asyncHandler(controller.getStatus));
router.post(
  '/razorpay/checkout',
  authenticate,
  checkoutRateLimiter,
  asyncHandler(controller.createRazorpayCheckout)
);
// Server-to-server callback from Razorpay — never rate-limited or authenticated as a user.
router.post('/razorpay/webhook', asyncHandler(controller.handleRazorpayWebhook));

export default router;
