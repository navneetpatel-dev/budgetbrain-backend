import { Response } from 'express';
import type { AuthRequest } from '@shared/types';
import { successResponse } from '@core/http/errors';
import * as subscriptionsService from '@shared/modules/subscriptions/index';

export async function getStatus(req: AuthRequest, res: Response) {
  const entitlement = await subscriptionsService.getEntitlementForUser(req.userId!);
  successResponse(res, entitlement);
}
