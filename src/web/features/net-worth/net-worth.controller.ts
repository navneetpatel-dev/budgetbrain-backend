import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import { getNetWorthDashboard } from '@shared/modules/net-worth/net-worth.service';

export async function getDashboard(req: Request, res: Response) {
  const data = await getNetWorthDashboard((req as AuthRequest).userId!);
  successResponse(res, data);
}
