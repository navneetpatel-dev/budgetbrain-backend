import { z } from 'zod';

export const createAccountSchema = z.object({
  name: z.string(),
  type: z.enum(['bank', 'credit_card', 'cash', 'wallet']),
  institution: z.string().optional(),
  accountNumberLast4: z.string().length(4).optional(),
  balance: z.number(),
  creditLimit: z.number().optional(),
  currency: z.string().length(3).optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().optional(),
  balance: z.number().optional(),
  creditLimit: z.number().optional(),
  isActive: z.boolean().optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
