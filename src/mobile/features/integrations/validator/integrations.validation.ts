import { z } from 'zod';
import { optionalText, requiredText, requiredDate, optionalDate, amountField } from '../../../../validation';

export const parseSmsSchema = z.object({
  content: requiredText('smsContent'),
});

export const parseEmailSchema = z.object({
  subject: requiredText('emailSubject'),
  body: requiredText('emailBody'),
});

export const confirmParsedSchema = z.object({
  categoryId: z.string().uuid(),
  amount: amountField().optional(),
  merchant: optionalText('merchant'),
  date: optionalDate,
});
