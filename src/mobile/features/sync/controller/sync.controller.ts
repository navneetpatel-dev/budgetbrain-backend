import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import { processBatchSync } from '../service/sync.service';
import type { SyncBatchInput } from '../types';

export async function processBatch(req: Request, res: Response) {
  const { items } = req.body as SyncBatchInput;
  const result = await processBatchSync((req as AuthRequest).userId!, items);
  successResponse(res, result);
}
