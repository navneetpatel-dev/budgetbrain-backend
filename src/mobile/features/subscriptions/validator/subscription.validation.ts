import { z } from 'zod';

export const restoreSubscriptionSchema = z.object({
  revenueCatId: z.string().optional(),
});
