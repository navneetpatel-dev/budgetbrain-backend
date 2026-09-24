import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import * as service from '@shared/modules/transaction-detection/transactionDetection.service';
import { getPackForClient } from '@modules/knowledge-base/packBuilder.service';
import { AppError } from '@shared/errors';
import type {
  ConfirmDetectedTransactionInput,
  DetectionSettingsInput,
  ListDetectedQuery,
  MerchantRuleInput,
  SyncDetectedBatchRequest,
} from '@shared/modules/transaction-detection/transactionDetection.types';

function pageParams(query: { page?: number; limit?: number }) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  return { page, limit, offset: (page - 1) * limit };
}

function paginated<T>(items: T[], count: number, page: number, limit: number) {
  return { items, pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) } };
}

export async function getConfig(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.getDetectionConfig(userId));
}

export async function updateSettings(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.updateDetectionSettings(userId, req.body as DetectionSettingsInput));
}

export async function getSyncState(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.getSyncState(userId));
}

export async function syncBatch(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const idempotencyKey = req.header('Idempotency-Key')?.slice(0, 100) || undefined;
  const data = await service.syncBatch(userId, req.body as SyncDetectedBatchRequest, { idempotencyKey });
  successResponse(res, data, 201);
}

export async function listDetected(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const query = req.query as unknown as ListDetectedQuery;
  const { page, limit, offset } = pageParams(query);
  const { rows, count } = await service.listDetected(userId, query, { limit, offset });
  successResponse(res, paginated(rows, count, page, limit));
}

export async function listPending(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { page, limit, offset } = pageParams(req.query as { page?: number; limit?: number });
  const { rows, count } = await service.listPending(userId, { limit, offset });
  successResponse(res, paginated(rows, count, page, limit));
}

export async function confirmPending(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const data = await service.confirmPending(userId, String(req.params.id), req.body as ConfirmDetectedTransactionInput);
  successResponse(res, data);
}

export async function rejectPending(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.rejectPending(userId, String(req.params.id)));
}

export async function undoDetected(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.undoDetected(userId, String(req.params.id)));
}

export async function getMerchantRules(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { rules, etag } = await service.getMerchantRules(userId);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  if (req.header('If-None-Match') === etag) {
    res.status(304).end();
    return;
  }
  successResponse(res, rules);
}

export async function saveMerchantRule(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.saveMerchantRule(userId, req.body as MerchantRuleInput), 201);
}

/**
 * The newest signed knowledge pack for a country (plan T4.3): a download URL, plus a delta URL
 * when the client's `since` version has one. 304 when the client already has this version.
 */
export async function getKnowledgePack(req: Request, res: Response) {
  const { country, since } = req.query as unknown as { country: string; since?: number };
  const pack = await getPackForClient(country, since ?? null);
  if (!pack) throw new AppError(404, 'No knowledge pack for this country yet', 'PACK_NOT_FOUND');
  res.setHeader('ETag', pack.etag);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  if (req.header('If-None-Match') === pack.etag) {
    res.status(304).end();
    return;
  }
  successResponse(res, pack);
}

export async function deleteMyDetectedData(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.deleteMyDetectedData(userId));
}
