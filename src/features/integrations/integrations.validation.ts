import { z } from 'zod';

export const parseSmsSchema = z.object({ content: z.string().min(10) });

export const parseEmailSchema = z.object({
  subject: z.string(),
  body: z.string().min(10),
});

export const confirmParsedSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive().optional(),
  merchant: z.string().optional(),
  date: z.string().optional(),
});

export type ConfirmParsedInput = z.infer<typeof confirmParsedSchema>;
