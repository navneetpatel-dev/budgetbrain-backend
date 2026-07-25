import { z } from 'zod';
import {
  optionalText,
  requiredText,
  optionalDate,
  amountField,
  uuidField,
} from '../../../../validation';

export const parseSmsSchema = z.object({
  content: requiredText('smsContent'),
});

export const parseEmailSchema = z.object({
  subject: requiredText('emailSubject'),
  body: requiredText('emailBody'),
});

export const confirmParsedSchema = z.object({
  categoryId: uuidField(),
  amount: amountField().optional(),
  merchant: optionalText('merchant'),
  date: optionalDate,
});
