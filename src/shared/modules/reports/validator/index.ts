import { z } from 'zod';
import { dateRangeObjectSchema, refineDateRangeOrder, uuidField } from '@shared/validation';

export const reportQuerySchema = dateRangeObjectSchema
  .extend({
    categoryId: uuidField().optional(),
    budgetId: uuidField().optional(),
    incomeSourceId: uuidField().optional(),
    type: z.enum(['expense', 'income']).optional(),
  })
  .superRefine(refineDateRangeOrder);

export type ReportQuerySchema = typeof reportQuerySchema;
