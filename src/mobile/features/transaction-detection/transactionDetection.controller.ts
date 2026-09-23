import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest, PaginationInput } from '@shared/types';
import * as service from '@shared/modules/transaction-detection/transactionDetection.service';
import type {
  ConfirmDetectedTransactionInput,
  MerchantRuleInput,
  SyncDetectedBatchRequest,
} from '@shared/modules/transaction-detection/transactionDetection.types';

export async function getSyncState(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const data = await service.getSyncState(userId);
  successResponse(res, data);
}

export async function syncBatch(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const data = await service.syncBatch(userId, req.body as SyncDetectedBatchRequest);
  successResponse(res, data, 201);
}

export async function listPending(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { page = 1, limit = 20 } = req.query as unknown as PaginationInput;
  const offset = (Number(page) - 1) * Number(limit);

  const { rows, count } = await service.listPending(userId, {
    limit: Number(limit),
    offset,
  });

  successResponse(res, {
    items: rows,
    pagination: {
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    },
  });
}

export async function confirmPending(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const id = String(req.params.id);
  const data = await service.confirmPending(
    userId,
    id,
    req.body as ConfirmDetectedTransactionInput
  );
  successResponse(res, data);
}

export async function rejectPending(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const id = String(req.params.id);
  const data = await service.rejectPending(userId, id);
  successResponse(res, data);
}

export async function getMerchantRules(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const data = await service.getMerchantRules(userId);
  successResponse(res, data);
}

export async function saveMerchantRule(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const data = await service.saveMerchantRule(userId, req.body as MerchantRuleInput);
  successResponse(res, data, 201);
}
