import { z } from 'zod';

export const revenueCatWebhookSchema = z
  .object({
    event: z
      .object({
        type: z.string().trim().min(1).max(100),
        app_user_id: z.string().trim().min(1).max(255).optional(),
        product_id: z.string().trim().max(255).optional(),
        expiration_at_ms: z.number().finite().optional(),
        original_transaction_id: z.string().trim().max(255).optional(),
        id: z.string().trim().max(255).optional(),
      })
      .passthrough(),
  })
  .passthrough();
