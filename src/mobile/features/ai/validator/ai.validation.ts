import { z } from 'zod';
import { requiredText, uuidField } from '../../../../validation';

export const chatSchema = z.object({
  message: requiredText('aiMessage'),
  conversationId: uuidField().optional(),
});
