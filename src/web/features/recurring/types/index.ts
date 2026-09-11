import { z } from 'zod';
import { createRecurringSeriesSchema, updateRecurringSeriesSchema } from '../validator/recurringSeries.validation';

export type CreateRecurringSeriesInput = z.infer<typeof createRecurringSeriesSchema>;
export type UpdateRecurringSeriesInput = z.infer<typeof updateRecurringSeriesSchema>;
