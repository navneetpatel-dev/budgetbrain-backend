import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import * as service from '@shared/modules/transaction-detection/transactionDetection.service';
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
  successResponse(res, await service.getMerchantRules(userId));
}

export async function saveMerchantRule(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await service.saveMerchantRule(userId, req.body as MerchantRuleInput), 201);
}
