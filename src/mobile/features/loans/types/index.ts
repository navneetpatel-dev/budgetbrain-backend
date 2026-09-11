import { z } from 'zod';
import { createLoanSchema, updateLoanSchema, payLoanSchema } from '../validator/loan.validation';

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
export type PayLoanInput = z.infer<typeof payLoanSchema>;
