import { z } from 'zod';
import { PAYMENT_METHODS, TRANSACTION_SUBTYPES, TRANSACTION_TYPES } from '@budgetbrain/detection-core';
import { CATALOG_ENTITIES } from '@modules/knowledge-base/catalog.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dashboardQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export const entityParamSchema = z.object({ entity: z.enum(CATALOG_ENTITIES) });
export const entityRowParamSchema = z.object({ entity: z.enum(CATALOG_ENTITIES), id: z.string().min(1).max(200) });

export const catalogQuerySchema = z.object({
  status: z.enum(['draft', 'review', 'published']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const catalogCreateSchema = z.object({ id: z.string().trim().max(200).optional(), data: z.record(z.string(), z.unknown()) }).strict();
export const catalogUpdateSchema = z.object({ data: z.record(z.string(), z.unknown()) }).strict();
export const catalogStatusSchema = z.object({ status: z.enum(['draft', 'review', 'published']) }).strict();

export const packBuildSchema = z.object({ country: z.string().regex(/^[A-Z]{2}$/).optional() }).strict();

export const killSwitchCreateSchema = z
  .object({
    scope: z.enum(['institution', 'template', 'country', 'pack', 'app_version']),
    key: z.string().trim().min(1).max(120),
    action: z.enum(['disable_auto_create', 'disable_detection']),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const killSwitchUpdateSchema = z.object({ active: z.boolean(), reason: z.string().trim().min(3).max(500).optional() }).strict();

/** `default` in the URL is the row for users whose country has none of its own. */
export const rolloutParamSchema = z.object({ country: z.union([z.literal('default'), z.string().regex(/^[A-Z]{2}$/)]) });
export const rolloutSchema = z
  .object({
    percent: z.number().int().min(0).max(100),
    includeInternal: z.boolean().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const skeletonParamSchema = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) });
export const templateFromSkeletonSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{1,119}$/),
    institutionId: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{1,79}$/),
    language: z.string().trim().min(2).max(20),
    fields: z.array(z.enum(['amount', 'balance', 'limit', 'date', 'time', 'account', 'reference', 'merchant', 'counterparty', 'ignore'])).max(40),
    direction: z.enum(['DEBIT', 'CREDIT']),
    transactionType: z.enum(TRANSACTION_TYPES),
    subtype: z.enum(TRANSACTION_SUBTYPES).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    dateOrder: z.enum(['DMY', 'MDY', 'YMD']).optional(),
    sample: z.string().trim().min(5).max(1200),
  })
  .strict();

export const promoteAliasSchema = z
  .object({
    aliasKey: z.string().trim().min(2).max(200),
    merchantId: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{1,79}$/),
    country: z.union([z.string().regex(/^[A-Z]{2}$/), z.literal('')]).optional(),
  })
  .strict();
