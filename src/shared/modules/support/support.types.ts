import { z } from 'zod';
import { createTicketSchema } from './support.validator';

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
