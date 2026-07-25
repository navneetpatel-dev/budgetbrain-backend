import { z } from 'zod';
import { createAccountSchema, updateAccountSchema } from '../validator/account.validation';

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
