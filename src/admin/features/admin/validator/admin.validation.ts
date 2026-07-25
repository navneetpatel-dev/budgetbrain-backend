import { z } from 'zod';
import {
  optionalText,
  optionalDate,
  uuidField,
  FieldLimits,
  ValidationMessages as M,
  paginationSchema,
  enumField,
} from '../../../../shared/validation';

export const updateUserSchema = z.object({
  role: enumField(['free', 'premium', 'lifetime', 'admin'] as const).optional(),
  suspended: z.boolean().optional(),
});

export const updateSupportTicketSchema = z.object({
  status: enumField(['open', 'in_progress', 'resolved', 'closed'] as const).optional(),
  adminNotes: z
    .string()
    .trim()
    .max(FieldLimits.adminNotes.max, M.maxChars(FieldLimits.adminNotes.max))
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

export const auditLogsQuerySchema = paginationSchema.extend({
  action: optionalText('auditAction'),
  resource: optionalText('auditResource'),
  source: enumField(['mobile', 'web', 'admin', 'system'] as const).optional(),
  outcome: enumField(['success', 'failure'] as const).optional(),
  severity: enumField(['info', 'warning', 'critical'] as const).optional(),
  actorUserId: uuidField().optional(),
  requestId: optionalText('requestId'),
  startDate: optionalDate,
  endDate: optionalDate,
});
