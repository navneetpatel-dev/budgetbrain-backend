import { z } from 'zod';
import { createTicketSchema } from '../validator/support.validation';

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
