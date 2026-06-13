import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(255),
  message: z.string().min(10),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
