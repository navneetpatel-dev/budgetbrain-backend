import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { User, Subscription } from '../models';
import { env } from '../config/env';

const router = Router();

router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const secret = req.headers['authorization'];
    if (env.REVENUECAT_WEBHOOK_SECRET && secret !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`) {
      throw new AppError(401, 'Invalid webhook secret');
    }

    const event = req.body as {
      event?: {
        type?: string;
        app_user_id?: string;
        product_id?: string;
        expiration_at_ms?: number;
      };
    };

    const userId = event.event?.app_user_id;
    if (!userId) {
      successResponse(res, { received: true });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      successResponse(res, { received: true });
      return;
    }

    const productId = event.event?.product_id ?? '';
    let plan: 'monthly' | 'yearly' | 'lifetime' = 'monthly';
    if (productId.includes('yearly')) plan = 'yearly';
    if (productId.includes('lifetime')) plan = 'lifetime';

    const isActive = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE'].includes(
      event.event?.type ?? ''
    );

    if (isActive) {
      await Subscription.create({
        userId,
        plan,
        status: 'active',
        expiresAt: event.event?.expiration_at_ms
          ? new Date(event.event.expiration_at_ms)
          : plan === 'lifetime'
            ? null
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        purchasedAt: new Date(),
      });

      await user.update({ role: plan === 'lifetime' ? 'lifetime' : 'premium' });
    } else if (event.event?.type === 'EXPIRATION') {
      await user.update({ role: 'free' });
    }

    successResponse(res, { received: true });
  })
);

router.use(authenticate);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const user = (req as AuthRequest).user!;
    const subscription = await Subscription.findOne({
      where: { userId: user.id, status: 'active' },
      order: [['createdAt', 'DESC']],
    });

    successResponse(res, {
      role: user.role,
      subscription,
      plans: {
        monthly: { price: 199, currency: 'INR', period: 'month' },
        yearly: { price: 1499, currency: 'INR', period: 'year' },
        lifetime: { price: 3999, currency: 'INR', period: 'once' },
      },
    });
  })
);

router.post(
  '/restore',
  asyncHandler(async (req, res) => {
    const { revenueCatId } = z.object({ revenueCatId: z.string() }).parse(req.body);
    const subscription = await Subscription.findOne({
      where: { revenueCatId, status: 'active' },
    });

    if (subscription) {
      const user = await User.findByPk((req as AuthRequest).userId!);
      if (user) {
        await user.update({
          role: subscription.plan === 'lifetime' ? 'lifetime' : 'premium',
        });
      }
    }

    successResponse(res, { restored: !!subscription });
  })
);

export default router;
