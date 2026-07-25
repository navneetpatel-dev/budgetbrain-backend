import { z } from 'zod';
import { optionalText, requiredText } from '../../../../validation';

export const parseSmsSchema = z.object({
  content: requiredText('smsContent'),
});

export const parseEmailSchema = z.object({
  subject: requiredText('emailSubject'),
  body: requiredText('emailBody'),
});

export const confirmParsedSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive().optional(),
  merchant: optionalText('merchant'),
  date: z.string().min(1).max(40).optional(),
});
