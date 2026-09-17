import { Request, Response } from 'express';
import { successResponse, AppError } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import { Transaction, TransactionAttachment } from '../../../../shared/models';
import { uploadFile, withSignedDownloadUrl } from '../../../shared/services/s3.service';

export async function createAttachment(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id: transactionId } = req.params as { id: string };

  const transaction = await Transaction.findOne({ where: { id: transactionId, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');
  if (!req.file) throw new AppError(400, 'Receipt file is required');

  const uploaded = await uploadFile(req.file);
  const attachment = await TransactionAttachment.create({
    transactionId,
    fileName: uploaded.fileName,
    fileType: uploaded.fileType,
    fileSize: uploaded.fileSize,
    s3Key: uploaded.key,
    s3Url: uploaded.url,
  });

  successResponse(res, await withSignedDownloadUrl(attachment.toJSON()), 201);
}

export async function listAttachments(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const transaction = await Transaction.findOne({
    where: { id: String(req.params.id), userId },
    include: [{ model: TransactionAttachment, as: 'attachments' }],
  });
  if (!transaction) throw new AppError(404, 'Transaction not found');
  const attachments =
    (transaction as Transaction & { attachments?: TransactionAttachment[] }).attachments ?? [];
  successResponse(
    res,
    await Promise.all(attachments.map((attachment) => withSignedDownloadUrl(attachment.toJSON())))
  );
}

export async function getAttachment(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id, attachmentId } = req.params as { id: string; attachmentId: string };

  const transaction = await Transaction.findOne({ where: { id, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');

  const attachment = await TransactionAttachment.findOne({
    where: { id: attachmentId, transactionId: transaction.id },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');

  successResponse(res, await withSignedDownloadUrl(attachment.toJSON()));
}

export async function deleteAttachment(req: Request, res: Response) {
  const userId = (req as AuthRequest).userId!;
  const { id, attachmentId } = req.params as { id: string; attachmentId: string };

  const transaction = await Transaction.findOne({ where: { id, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');

  const attachment = await TransactionAttachment.findOne({
    where: { id: attachmentId, transactionId: transaction.id },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');

  await attachment.destroy();
  successResponse(res, { message: 'Attachment deleted' });
}
