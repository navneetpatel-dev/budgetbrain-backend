import { z } from 'zod';
import { ValidationMessages as M } from '../../../../validation';

export const revenueCatWebhookSchema = z
  .object({
    event: z
      .object({
        type: z.string().trim().min(1, M.minChars(1)).max(100, M.maxChars(100)),
        app_user_id: z.string().trim().min(1, M.minChars(1)).max(255, M.maxChars(255)).optional(),
        product_id: z.string().trim().max(255, M.maxChars(255)).optional(),
        expiration_at_ms: z.number({ invalid_type_error: M.valueType }).finite(M.valueFinite).optional(),
        original_transaction_id: z.string().trim().max(255, M.maxChars(255)).optional(),
        id: z.string().trim().max(255, M.maxChars(255)).optional(),
      })
      .passthrough(),
  })
  .passthrough();
