import { z } from 'zod';
import {
  dateRangeObjectSchema,
  paginationSchema,
  refineDateRangeOrder,
} from '@shared/validation/index';
import {
  optionalText,
  requiredText,
  currencyField,
  transactionDate,
  amountField,
  optionalMoneyValueField,
  uuidField,
  enumField,
  tagsField,
  ValidationMessages as M,
} from '@shared/validation/index';

const TRANSACTION_TYPES = ['expense', 'income', 'refund', 'transfer'] as const;
const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'other'] as const;
const TRANSACTION_SUBTYPES = ['cashback', 'reversal', 'card_bill', 'p2p', 'self_transfer', 'wallet_topup'] as const;

/** Which subtypes make sense for which type; anything else is a client bug. */
const SUBTYPES_BY_TYPE: Record<(typeof TRANSACTION_TYPES)[number], readonly string[]> = {
  expense: ['p2p'],
  income: ['p2p'],
  refund: ['cashback', 'reversal'],
  transfer: ['card_bill', 'self_transfer', 'wallet_topup'],
};

const transactionObjectSchema = z.object({
  type: enumField(TRANSACTION_TYPES),
  amount: amountField(),
  currency: currencyField(true),
  categoryId: uuidField().optional(),
  incomeSourceId: uuidField().optional(),
  financialAccountId: uuidField().nullable().optional(),
  notes: optionalText('notes'),
  merchant: optionalText('merchant'),
  date: transactionDate,
  paymentMethod: enumField(PAYMENT_METHODS).optional(),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
  tags: tagsField(),
  /** Income-only. `netAmount` is never accepted from the client — always server-computed. */
  taxWithheld: optionalMoneyValueField(),
  subtype: enumField(TRANSACTION_SUBTYPES).optional(),
  /** Transfers only: whether this leg took money out of (DEBIT) or into (CREDIT) the account. */
  direction: enumField(['DEBIT', 'CREDIT'] as const).optional(),
  /** Refunds only: the expense this refunds, when known. */
  refundOfTransactionId: uuidField().optional(),
  /** Transfers only: shared by both legs of one transfer between the user's own accounts. */
  transferGroupId: uuidField().optional(),
});

export const transactionSchema = transactionObjectSchema.superRefine((data, ctx) => {
  if (data.type === 'expense' && !data.merchant) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['merchant'],
      message: M.minChars(1),
    });
  }
  if (data.type === 'expense' && !data.categoryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryId'],
      message: M.categoryRequired,
    });
  }
  if (data.type !== 'income' && data.taxWithheld !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taxWithheld'],
      message: 'taxWithheld only applies to income transactions',
    });
  }
  if (data.type === 'transfer' && !data.direction) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['direction'],
      message: 'A transfer must say whether money left (DEBIT) or entered (CREDIT) the account',
    });
  }
  if (data.type !== 'transfer' && data.direction !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['direction'], message: 'direction only applies to transfers' });
  }
  if (data.type !== 'transfer' && data.transferGroupId !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transferGroupId'], message: 'transferGroupId only applies to transfers' });
  }
  if (data.type !== 'refund' && data.refundOfTransactionId !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['refundOfTransactionId'],
      message: 'refundOfTransactionId only applies to refunds',
    });
  }
  if (data.subtype !== undefined && !SUBTYPES_BY_TYPE[data.type].includes(data.subtype)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['subtype'],
      message: `subtype ${data.subtype} does not apply to ${data.type}`,
    });
  }
});

export const listTransactionsSchema = paginationSchema
  .merge(dateRangeObjectSchema)
  .extend({
    type: enumField(TRANSACTION_TYPES).optional(),
    categoryId: uuidField().optional(),
    incomeSourceId: uuidField().optional(),
    paymentMethod: enumField(PAYMENT_METHODS).optional(),
    search: optionalText('search'),
    tag: optionalText('tag'),
  })
  .superRefine(refineDateRangeOrder);

export const searchQuerySchema = paginationSchema.extend({
  q: requiredText('search'),
});

/**
 * A transaction's type-specific fields are fixed at creation; changing them would need
 * balance and pairing rewrites, so edits go through delete + create instead.
 */
export const updateTransactionSchema = transactionObjectSchema
  .omit({ type: true, direction: true, transferGroupId: true, refundOfTransactionId: true, subtype: true })
  .partial();

export const syncTransactionCreateSchema = transactionSchema;

export const syncTransactionUpdateSchema = updateTransactionSchema.extend({
  id: uuidField().optional(),
});

export const syncTransactionDeleteSchema = z.object({
  id: uuidField().optional(),
});

export const attachmentParamsSchema = z.object({
  id: uuidField(),
  attachmentId: uuidField(),
});
