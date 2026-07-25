import { z } from 'zod';
import { updateSupportTicketSchema, updateUserSchema } from '../validator/admin.validation';

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;
