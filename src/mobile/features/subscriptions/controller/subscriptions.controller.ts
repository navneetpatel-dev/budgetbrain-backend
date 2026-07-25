import { Request, Response } from 'express';
import { successResponse, AppError } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as subscriptionService from '../service/subscription.service';
import type { RestoreSubscriptionInput } from '../types';
import { env } from '../../../shared/config/env';

export async function handleWebhook(req: Request, res: Response) {
  const secret = req.headers['authorization'];
  if (env.REVENUECAT_WEBHOOK_SECRET && secret !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`) {
    throw new AppError(401, 'Invalid webhook secret');
  }
  await subscriptionService.handleWebhook(req.body);
  successResponse(res, { received: true });
}

export async function getStatus(req: Request, res: Response) {
  const user = (req as AuthRequest).user!;
  const data = await subscriptionService.getSubscriptionStatus(user.id, user.role);
  successResponse(res, data);
}

export async function restore(req: Request, res: Response) {
  const { revenueCatId } = req.body as RestoreSubscriptionInput;
  const data = await subscriptionService.restoreSubscription(
    (req as AuthRequest).userId!,
    revenueCatId
  );
  successResponse(res, data);
}
