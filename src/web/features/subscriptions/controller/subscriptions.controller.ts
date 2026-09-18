import { Request, Response } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError, successResponse } from '../../../shared/utils/errors';
import * as subscriptionsService from '@shared/modules/subscriptions';
import * as razorpayService from '@shared/modules/subscriptions/razorpay.service';
import { SUBSCRIPTION_PLAN } from '@shared/modules/subscriptions/subscriptions.constants';

export async function handleWebhook(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  const configuredSecret = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;

  if (configuredSecret) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== configuredSecret) {
      throw new AppError(401, 'Unauthorized webhook request', 'UNAUTHORIZED_WEBHOOK');
    }
  }

  const result = await subscriptionsService.upsertFromWebhookEvent(req.body);
  successResponse(res, { received: true, subscription: result });
}

export async function getStatus(req: AuthRequest, res: Response) {
  const entitlement = await subscriptionsService.getEntitlementForUser(req.userId!);
  successResponse(res, entitlement);
}

const VALID_PLANS = Object.values(SUBSCRIPTION_PLAN);

export async function createRazorpayCheckout(req: AuthRequest, res: Response) {
  const { plan } = req.body ?? {};
  if (typeof plan !== 'string' || !VALID_PLANS.includes(plan as (typeof VALID_PLANS)[number])) {
    throw new AppError(400, `plan must be one of: ${VALID_PLANS.join(', ')}`, 'INVALID_PLAN');
  }

  const result = await razorpayService.createCheckoutOrder(req.userId!, plan as never);
  successResponse(res, result);
}

export async function handleRazorpayWebhook(req: Request, res: Response) {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.headers['x-razorpay-signature'] as string | undefined;

  if (!rawBody || !razorpayService.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError(401, 'Invalid Razorpay webhook signature', 'UNAUTHORIZED_WEBHOOK');
  }

  const result = await razorpayService.upsertFromRazorpayEvent(req.body);
  successResponse(res, { received: true, subscription: result });
}
