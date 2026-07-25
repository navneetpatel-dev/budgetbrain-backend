import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.string().max(40).optional(),
  endDate: z.string().max(40).optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
