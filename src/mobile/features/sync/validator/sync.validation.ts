import { z } from 'zod';
import { requiredText } from '../../../../validation';

export const syncBatchSchema = z.object({
  items: z
    .array(
      z.object({
        id: requiredText('syncItemId'),
        action: z.enum(['create', 'update', 'delete']),
        resource: requiredText('syncResource'),
        payload: z.record(z.unknown()),
        timestamp: z.string().min(1).max(40),
      })
    )
    .min(1)
    .max(100),
});
