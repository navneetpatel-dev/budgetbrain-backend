import { z } from 'zod';

export const updateUserSchema = z.object({
  role: z.enum(['free', 'premium', 'lifetime', 'admin']).optional(),
  suspended: z.boolean().optional(),
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  adminNotes: z.string().nullable().optional(),
});
