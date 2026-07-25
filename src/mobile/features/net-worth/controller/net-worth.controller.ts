import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import { getNetWorthDashboard } from '../service/netWorth.service';

export async function getDashboard(req: Request, res: Response) {
  const data = await getNetWorthDashboard((req as AuthRequest).userId!);
  successResponse(res, data);
}
