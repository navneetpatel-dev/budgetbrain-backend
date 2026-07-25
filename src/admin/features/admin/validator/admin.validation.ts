import { z } from 'zod';
import {
  optionalText,
  optionalDate,
  uuidField,
  FieldLimits,
  ValidationMessages as M,
} from '../../../../validation';

export const updateUserSchema = z.object({
  role: z.enum(['free', 'premium', 'lifetime', 'admin'], {
    errorMap: () => ({ message: M.enumInvalid }),
  }).optional(),
  suspended: z.boolean().optional(),
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed'], {
    errorMap: () => ({ message: M.enumInvalid }),
  }).optional(),
  adminNotes: z
    .string()
    .trim()
    .max(FieldLimits.adminNotes.max, M.maxChars(FieldLimits.adminNotes.max))
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, M.pageMin).optional(),
  limit: z.coerce.number().int().min(1, M.limitRange).max(100, M.limitRange).optional(),
  action: optionalText('auditAction'),
  resource: optionalText('auditResource'),
  source: z.enum(['mobile', 'web', 'admin', 'system'], {
    errorMap: () => ({ message: M.enumInvalid }),
  }).optional(),
  outcome: z.enum(['success', 'failure'], {
    errorMap: () => ({ message: M.enumInvalid }),
  }).optional(),
  severity: z.enum(['info', 'warning', 'critical'], {
    errorMap: () => ({ message: M.enumInvalid }),
  }).optional(),
  actorUserId: uuidField().optional(),
  requestId: optionalText('requestId'),
  startDate: optionalDate,
  endDate: optionalDate,
});
