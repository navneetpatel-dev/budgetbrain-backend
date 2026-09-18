import { Response } from 'express';
import type { AuthRequest } from '@shared/types';
import { successResponse } from '../../../shared/utils/errors';
import * as searchService from '@shared/modules/search';

export async function search(req: AuthRequest, res: Response) {
  const q = String(req.query.q ?? req.query.query ?? '');
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const data = await searchService.executeGlobalSearch(req.userId!, q, { page, limit });
  successResponse(res, data);
}
