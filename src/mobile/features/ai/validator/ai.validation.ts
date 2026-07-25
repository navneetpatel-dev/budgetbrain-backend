import { z } from 'zod';
import { requiredText } from '../../../../validation';

export const chatSchema = z.object({
  message: requiredText('aiMessage'),
  conversationId: z.string().uuid().optional(),
});
