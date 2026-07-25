import { z } from 'zod';

export const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});
