import { z } from 'zod';
import { requiredText, timestampField, ValidationMessages as M } from '../../../../shared/validation';
import {
  syncTransactionCreateSchema,
  syncTransactionUpdateSchema,
  syncTransactionDeleteSchema,
} from '../../expenses/validator/transaction.validation';

const syncItemBase = z.object({
  id: requiredText('syncItemId'),
  resource: z.literal('transaction'),
  timestamp: timestampField(),
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
  items: z
    .array(z.discriminatedUnion('action', [createItemSchema, updateItemSchema, deleteItemSchema]))
    .min(1, M.syncBatchMin)
    .max(100, M.syncBatchMax),
});
