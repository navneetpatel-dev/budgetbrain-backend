import { z } from 'zod';
import { dateRangeObjectSchema, refineDateRangeOrder, uuidField } from '@shared/validation/index';

export const reportQuerySchema = dateRangeObjectSchema
  .extend({
    categoryId: uuidField().optional(),
    budgetId: uuidField().optional(),
    incomeSourceId: uuidField().optional(),
    type: z.enum(['expense', 'income']).optional(),
  })
  .superRefine(refineDateRangeOrder);

export type ReportQuerySchema = typeof reportQuerySchema;

export const exportAsyncBodySchema = z.object({
  format: z.enum(['csv', 'excel', 'pdf']),
  filters: reportQuerySchema.optional(),
});

export type ExportAsyncBodySchema = typeof exportAsyncBodySchema;
