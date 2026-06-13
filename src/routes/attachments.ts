import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { Transaction, TransactionAttachment } from '../models';
import { uploadFile } from '../services/s3Service';

const router = Router();
router.use(authenticate);

router.post(
  '/:id/attachments',
  upload.single('receipt'),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const transactionId = String(req.params.id);

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

    successResponse(res, attachment, 201);
  })
);

router.get(
  '/:id/attachments',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const transaction = await Transaction.findOne({
      where: { id: String(req.params.id), userId },
      include: [{ model: TransactionAttachment, as: 'attachments' }],
    });
    if (!transaction) throw new AppError(404, 'Transaction not found');
    successResponse(res, (transaction as Transaction & { attachments?: TransactionAttachment[] }).attachments ?? []);
  })
);

router.delete(
  '/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const transaction = await Transaction.findOne({ where: { id: String(req.params.id), userId } });
    if (!transaction) throw new AppError(404, 'Transaction not found');

    const attachment = await TransactionAttachment.findOne({
      where: { id: String(req.params.attachmentId), transactionId: transaction.id },
    });
    if (!attachment) throw new AppError(404, 'Attachment not found');

    await attachment.destroy();
    successResponse(res, { message: 'Attachment deleted' });
  })
);

export default router;
