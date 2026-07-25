import { z } from 'zod';
import { requiredText } from '../../../../validation';
import {
  syncTransactionCreateSchema,
  syncTransactionUpdateSchema,
  syncTransactionDeleteSchema,
} from '../../expenses/validator/transaction.validation';

const syncItemBase = z.object({
  id: requiredText('syncItemId'),
  resource: z.literal('transaction'),
  timestamp: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid timestamp'),
});

const createItemSchema = syncItemBase.extend({
  action: z.literal('create'),
  payload: syncTransactionCreateSchema,
});

const updateItemSchema = syncItemBase.extend({
  action: z.literal('update'),
  payload: syncTransactionUpdateSchema,
});

const deleteItemSchema = syncItemBase.extend({
  action: z.literal('delete'),
  payload: syncTransactionDeleteSchema,
});

export const syncBatchSchema = z.object({
  items: z.array(z.discriminatedUnion('action', [createItemSchema, updateItemSchema, deleteItemSchema])).min(1).max(100),
});
