import { z } from 'zod';
import { requiredText, enumField } from '../../../../validation';

export const createTicketSchema = z.object({
  subject: requiredText('subject'),
  message: requiredText('message'),
  priority: enumField(['low', 'medium', 'high'] as const).optional(),
});
