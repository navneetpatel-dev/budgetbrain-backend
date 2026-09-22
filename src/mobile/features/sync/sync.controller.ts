import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import { processBatchSync } from '@shared/modules/sync/sync.service';
import type { SyncBatchInput } from '@shared/modules/sync/sync.types';

export async function processBatch(req: Request, res: Response) {
  const { items } = req.body as SyncBatchInput;
  const result = await processBatchSync((req as AuthRequest).userId!, items);
  successResponse(res, result);
}
