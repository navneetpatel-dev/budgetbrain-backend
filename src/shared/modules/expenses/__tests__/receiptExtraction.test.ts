import { describe, expect, it } from 'vitest';
import { createTestTransaction, createTestUser } from '@testHelpers';
import { TransactionAttachment } from '@database/models';
import { saveReceiptExtraction } from '../service/attachments.service';

describe('receipt extraction persistence', () => {
  it('writes extracted receipt data onto the attachment', async () => {
    const user = await createTestUser();
    const transaction = await createTestTransaction(user.id);
    const attachment = await TransactionAttachment.create({
      transactionId: transaction.id,
      fileName: 'receipt.jpg',
      fileType: 'image/jpeg',
      fileSize: 1200,
      s3Key: 'budgetbrain/receipts/test.jpg',
      s3Url: 'http://localhost/uploads/test.jpg',
    });

    await saveReceiptExtraction(attachment.id, {
      merchant: 'Cafe',
      amount: 240,
      date: '2026-09-01',
      confidence: 0.9,
    });

    const refreshed = await TransactionAttachment.findByPk(attachment.id);
    expect(refreshed?.extractedData).toEqual({
      merchant: 'Cafe',
      amount: 240,
      date: '2026-09-01',
      confidence: 0.9,
    });
  });
});
