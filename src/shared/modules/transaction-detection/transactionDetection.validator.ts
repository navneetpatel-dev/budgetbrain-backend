import { z } from 'zod';
import {
  amountField,
  optionalText,
  requiredText,
  uuidField,
  transactionDate,
  tagsField,
} from '@shared/validation/index';

export const detectedItemSchema = z.object({
  amount: amountField(),
  currency: z.string().min(3).max(3).default('INR'),
  direction: z.enum(['DEBIT', 'CREDIT']),
  transactionType: z.enum(['expense', 'income', 'refund', 'transfer']).default('expense'),
  merchant: optionalText('merchant'),
  normalizedMerchant: optionalText('merchant'),
  categoryId: uuidField().optional().nullable(),
  financialAccountId: uuidField().optional().nullable(),
  accountTail: z.string().max(10).optional().nullable(),
  referenceNumber: z.string().max(100).optional().nullable(),
  institutionName: z.string().max(100).optional().nullable(),
  transactionDate: transactionDate,
  confidence: z.number().min(0).max(1).default(0.0),
  dedupFingerprint: z.string().min(16).max(64),
  source: z.enum(['android_sms', 'notification', 'email', 'csv', 'bank_api']).default('android_sms'),
  status: z
    .enum(['auto_approved', 'pending_review', 'user_confirmed', 'rejected', 'duplicate'])
    .optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export const syncDetectedBatchSchema = z.object({
  items: z.array(detectedItemSchema).min(1).max(100),
});

export const confirmDetectedTransactionSchema = z.object({
  categoryId: uuidField().optional().nullable(),
  financialAccountId: uuidField().optional().nullable(),
  merchant: optionalText('merchant'),
  notes: optionalText('notes'),
  tags: tagsField().nullable(),
  learnMerchantCategory: z.boolean().optional().default(true),
});

export const createMerchantRuleSchema = z.object({
  merchant: requiredText('merchant'),
  categoryId: uuidField(),
});
