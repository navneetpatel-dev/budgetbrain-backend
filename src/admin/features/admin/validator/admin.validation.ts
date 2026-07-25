import { z } from 'zod';

export const updateUserSchema = z.object({
  role: z.enum(['free', 'premium', 'lifetime', 'admin']).optional(),
  suspended: z.boolean().optional(),
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  adminNotes: z.string().nullable().optional(),
});

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  source: z.enum(['mobile', 'web', 'admin', 'system']).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  actorUserId: z.string().uuid().optional(),
  requestId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
