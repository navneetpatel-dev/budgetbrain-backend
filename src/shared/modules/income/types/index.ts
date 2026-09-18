import { z } from 'zod';
import { listIncomeSchema, createIncomeSchema, updateIncomeSchema, createSourceSchema } from '../validator/income.validation';

export type ListIncomeInput = z.infer<typeof listIncomeSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
