import { Transaction, TransactionAttachment } from '@database/models';
import { AppError } from '@shared/errors';
import { uploadFile, withSignedDownloadUrl, deleteFile } from '@core/storage/s3.service';
import { env } from '@config/env';
import { receiptExtractionQueue } from '@queue/queues';
import { createLogger } from '@shared/logging';
import type { ReceiptExtractedData } from '@database/models/transactionAttachment.model';

const log = createLogger('system');

/**
 * Never awaited by the request handler — a slow or failing OpenAI Vision call must not
 * block or fail the upload response. Extraction runs on the BullMQ 'receipt-extraction'
 * queue (durable, retried up to 2x) instead of an in-process fire-and-forget task, so a
 * process restart or a transient OpenAI failure no longer silently loses the extraction.
 */
export function scheduleReceiptExtraction(attachmentId: string, s3Key: string, s3Url: string): void {
  if (!env.OPENAI_API_KEY) return;
  void receiptExtractionQueue
    .add('extract', { attachmentId, s3Key, s3Url })
    .catch((err) =>
      log.warn('Failed to enqueue receipt extraction', {
        attachmentId,
        message: err instanceof Error ? err.message : String(err),
      })
    );
}

export async function saveReceiptExtraction(
  attachmentId: string,
  extracted: ReceiptExtractedData
): Promise<void> {
  await TransactionAttachment.update({ extractedData: extracted }, { where: { id: attachmentId } });
}

async function requireOwnedTransaction(userId: string, transactionId: string): Promise<Transaction> {
  const transaction = await Transaction.findOne({ where: { id: transactionId, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');
  return transaction;
}

export async function createTransactionAttachment(
  userId: string,
  transactionId: string,
  file: Express.Multer.File
) {
  await requireOwnedTransaction(userId, transactionId);

  const uploaded = await uploadFile(file);
  const attachment = await TransactionAttachment.create({
    transactionId,
    fileName: uploaded.fileName,
    fileType: uploaded.fileType,
    fileSize: uploaded.fileSize,
    s3Key: uploaded.key,
    s3Url: uploaded.url,
  });

  const signed = await withSignedDownloadUrl(attachment.toJSON());
  scheduleReceiptExtraction(attachment.id, attachment.s3Key, attachment.s3Url);
  return signed;
}

export async function getAttachmentSuggestion(userId: string, transactionId: string, attachmentId: string) {
  const transaction = await requireOwnedTransaction(userId, transactionId);
  const attachment = await TransactionAttachment.findOne({
    where: { id: attachmentId, transactionId: transaction.id },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');
  return { extractedData: attachment.extractedData };
}

export async function listTransactionAttachments(userId: string, transactionId: string) {
  const transaction = await Transaction.findOne({
    where: { id: transactionId, userId },
    include: [{ model: TransactionAttachment, as: 'attachments' }],
  });
  if (!transaction) throw new AppError(404, 'Transaction not found');
  const attachments =
    (transaction as Transaction & { attachments?: TransactionAttachment[] }).attachments ?? [];
  return Promise.all(attachments.map((attachment) => withSignedDownloadUrl(attachment.toJSON())));
}

export async function getTransactionAttachment(userId: string, transactionId: string, attachmentId: string) {
  const transaction = await requireOwnedTransaction(userId, transactionId);
  const attachment = await TransactionAttachment.findOne({
    where: { id: attachmentId, transactionId: transaction.id },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');
  return withSignedDownloadUrl(attachment.toJSON());
}

export async function deleteTransactionAttachment(userId: string, transactionId: string, attachmentId: string) {
  const transaction = await requireOwnedTransaction(userId, transactionId);
  const attachment = await TransactionAttachment.findOne({
    where: { id: attachmentId, transactionId: transaction.id },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');
  if (attachment.s3Key) {
    await deleteFile(attachment.s3Key);
  }
  await attachment.destroy();
  return { message: 'Attachment deleted' };
}
