import { z } from 'zod';
import { requiredText, timestampField, ValidationMessages as M } from '@shared/validation';

export const syncResourceEnum = z.enum(['transaction', 'income', 'budget', 'goal']);

const syncItemBase = z.object({
  id: requiredText('syncItemId'),
  resource: syncResourceEnum,
  timestamp: timestampField(),
});

const createItemSchema = syncItemBase.extend({
  action: z.literal('create'),
  payload: z.record(z.unknown()),
});

const updateItemSchema = syncItemBase.extend({
  action: z.literal('update'),
  payload: z.record(z.unknown()),
});

const deleteItemSchema = syncItemBase.extend({
  action: z.literal('delete'),
  payload: z.record(z.unknown()).optional().default({}),
});

export const syncBatchSchema = z.object({
  items: z
    .array(z.discriminatedUnion('action', [createItemSchema, updateItemSchema, deleteItemSchema]))
    .min(1, M.syncBatchMin)
    .max(100, M.syncBatchMax),
});
