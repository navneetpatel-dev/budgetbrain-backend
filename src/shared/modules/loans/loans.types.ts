import { z } from 'zod';
import { createLoanSchema, updateLoanSchema, payLoanSchema } from './loans.validator';

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
export type PayLoanInput = z.infer<typeof payLoanSchema>;
