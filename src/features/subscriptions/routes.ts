import { Router } from 'express';
import { asyncHandler, successResponse, AppError } from '../../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../../middleware/auth';
import * as subscriptionService from './subscription.service';
import { restoreSubscriptionSchema } from './subscription.validation';
import { env } from '../../config/env';

const router = Router();

router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const secret = req.headers['authorization'];
    if (env.REVENUECAT_WEBHOOK_SECRET && secret !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`) {
      throw new AppError(401, 'Invalid webhook secret');
    }
    await subscriptionService.handleWebhook(req.body);
    successResponse(res, { received: true });
  })
);

router.use(authenticate);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const user = (req as AuthRequest).user!;
    const data = await subscriptionService.getSubscriptionStatus(user.id, user.role);
    successResponse(res, data);
  })
);

router.post(
  '/restore',
  asyncHandler(async (req, res) => {
    const { revenueCatId } = restoreSubscriptionSchema.parse(req.body);
    const data = await subscriptionService.restoreSubscription(
      (req as AuthRequest).userId!,
      revenueCatId
    );
    successResponse(res, data);
  })
);

export default router;
