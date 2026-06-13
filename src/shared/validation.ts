import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
