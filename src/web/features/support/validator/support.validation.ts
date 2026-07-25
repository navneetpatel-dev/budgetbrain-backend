import { z } from 'zod';
import { requiredText } from '../../../../validation';

export const createTicketSchema = z.object({
  subject: requiredText('subject'),
  message: requiredText('message'),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});
