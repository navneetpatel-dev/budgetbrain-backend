import { Request, Response } from 'express';
import { successResponse, AppError } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import {
  createTransactionAttachment,
  deleteTransactionAttachment,
  getAttachmentSuggestion as loadAttachmentSuggestion,
  getTransactionAttachment,
  listTransactionAttachments,
} from '@shared/modules/expenses/service/attachments.service';

export async function createAttachment(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id: transactionId } = req.params as { id: string };
  if (!req.file) throw new AppError(400, 'Receipt file is required');

  const data = await createTransactionAttachment(userId, transactionId, req.file);
  successResponse(res, data, 201);
}

export async function getAttachmentSuggestion(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id, attachmentId } = req.params as { id: string; attachmentId: string };
  successResponse(res, await loadAttachmentSuggestion(userId, id, attachmentId));
}

export async function listAttachments(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  successResponse(res, await listTransactionAttachments(userId, String(req.params.id)));
}

export async function getAttachment(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id, attachmentId } = req.params as { id: string; attachmentId: string };
  successResponse(res, await getTransactionAttachment(userId, id, attachmentId));
}

export async function deleteAttachment(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id, attachmentId } = req.params as { id: string; attachmentId: string };
  successResponse(res, await deleteTransactionAttachment(userId, id, attachmentId));
}
