import { z } from 'zod';

export const syncBatchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      action: z.enum(['create', 'update', 'delete']),
      resource: z.string(),
      payload: z.record(z.unknown()),
      timestamp: z.string(),
    })
  ),
});
