import { z } from 'zod';
import { optionalText, FieldLimits } from '../../../../validation';

export const updateUserSchema = z.object({
  role: z.enum(['free', 'premium', 'lifetime', 'admin']).optional(),
  suspended: z.boolean().optional(),
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  adminNotes: z
    .string()
    .trim()
    .max(FieldLimits.adminNotes.max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
});

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  action: optionalText('auditAction'),
  resource: optionalText('auditResource'),
  source: z.enum(['mobile', 'web', 'admin', 'system']).optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  actorUserId: z.string().uuid().optional(),
  requestId: optionalText('requestId'),
  startDate: z.string().max(40).optional(),
  endDate: z.string().max(40).optional(),
});
