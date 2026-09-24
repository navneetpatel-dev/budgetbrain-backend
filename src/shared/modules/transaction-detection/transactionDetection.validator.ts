import { z } from 'zod';
import { MESSAGE_SOURCES, PAYMENT_METHODS, TRANSACTION_SUBTYPES, TRANSACTION_TYPES } from '@budgetbrain/detection-core';
import { optionalText, tagsField, uuidField } from '@shared/validation/index';
import { DETECTION_LIMITS } from './transactionDetection.constants';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date');
const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, 'Must be an ISO 8601 date-time with offset');

const evidenceSchema = z
  .object({
    templateMatched: z.boolean(),
    templateId: z.string().max(120).optional(),
    institutionVerified: z.boolean(),
    amountRoleUnique: z.boolean(),
    directionUnambiguous: z.boolean(),
    merchantKnown: z.boolean(),
    dateExtracted: z.boolean(),
    referencePresent: z.boolean(),
    merchantFuzzy: z.boolean(),
  })
  .strict();

/**
 * One detected transaction as sent by a client (core `SyncItemPayload`).
 * Strict: unknown keys are rejected, so a client can't slip raw message text into the payload
 * (spec §22). Semantic checks that need more than the shape live in serverValidation.engine.
 */
export const detectedItemSchema = z
  .object({
    clientId: z.string().min(1).max(64),
    // Decimal string, never a float (e.g. "1250.00"); precision is checked per currency later.
    amount: z.string().regex(/^\d{1,13}(?:\.\d{1,4})?$/, 'Must be a positive decimal string'),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 code'),
    direction: z.enum(['DEBIT', 'CREDIT']),
    transactionType: z.enum(TRANSACTION_TYPES),
    subtype: z.enum(TRANSACTION_SUBTYPES).nullable(),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    institutionId: z.string().max(100).nullable(),
    accountTail: z.string().regex(/^\d{3,4}$/, 'Must be the last 3–4 digits').nullable(),
    referenceNumber: z.string().max(100).nullable(),
    merchantName: z.string().trim().max(255).nullable(),
    merchantId: z.string().max(100).nullable(),
    taxonomyCode: z.string().max(100).nullable(),
    categoryId: uuidField().nullable(),
    categorySource: z.enum(['user', 'rule', 'knowledge_base', 'context', 'fallback']).nullable(),
    financialAccountId: uuidField().nullable(),
    transactionDate: isoDate,
    receivedAt: isoDateTime,
    evidence: evidenceSchema,
    confidenceTier: z.enum(['high', 'medium', 'low']),
    dedupFingerprint: z.string().regex(/^v2_[0-9a-f]{64}$/, 'Must be a core v2 fingerprint'),
    source: z.enum(MESSAGE_SOURCES),
  })
  .strict();

export const syncDetectedBatchSchema = z
  .object({
    items: z.array(detectedItemSchema).min(1).max(DETECTION_LIMITS.MAX_ITEMS_PER_BATCH),
  })
  .strict();

export const confirmDetectedTransactionSchema = z.object({
  categoryId: uuidField().optional().nullable(),
  financialAccountId: uuidField().optional().nullable(),
  merchant: optionalText('merchant'),
  notes: optionalText('notes'),
  tags: tagsField().nullable(),
  /** Correcting the type while confirming, e.g. an income that was really a refund. */
  transactionType: z.enum(TRANSACTION_TYPES).optional(),
  subtype: z.enum(TRANSACTION_SUBTYPES).nullable().optional(),
  /** Remember merchant → category, but only when the user actually changed the category. */
  learnMerchantCategory: z.boolean().optional().default(true),
});

export const createMerchantRuleSchema = z.object({
  merchant: z.string().trim().min(1).max(255),
  categoryId: uuidField(),
});

export const detectionSettingsSchema = z
  .object({
    autoAddHighConfidence: z.boolean(),
  })
  .strict();

export const listDetectedQuerySchema = z.object({
  status: z.enum(['auto_approved', 'pending_review', 'user_confirmed', 'rejected', 'duplicate']).optional(),
  source: z.enum(MESSAGE_SOURCES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
