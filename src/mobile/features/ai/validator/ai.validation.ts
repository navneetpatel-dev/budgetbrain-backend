import { z } from 'zod';
import { requiredText, uuidField } from '../../../../shared/validation';

export const chatSchema = z.object({
  message: requiredText('aiMessage'),
  conversationId: uuidField().optional(),
});
