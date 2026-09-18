import { Request, Response } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError, successResponse } from '../../../shared/utils/errors';
import * as subscriptionsService from '@shared/modules/subscriptions';

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
