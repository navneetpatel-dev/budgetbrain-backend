import { Response } from 'express';
import type { AuthRequest } from '@shared/types';
import { successResponse } from '../../../shared/utils/errors';
import * as subscriptionsService from '@shared/modules/subscriptions';

export async function getStatus(req: AuthRequest, res: Response) {
  const entitlement = await subscriptionsService.getEntitlementForUser(req.userId!);
  successResponse(res, entitlement);
}
