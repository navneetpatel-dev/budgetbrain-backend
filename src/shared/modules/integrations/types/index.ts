import { z } from 'zod';
import { parseSmsSchema, parseEmailSchema, confirmParsedSchema } from '../validator/integrations.validation';

export type ParseSmsInput = z.infer<typeof parseSmsSchema>;
export type ParseEmailInput = z.infer<typeof parseEmailSchema>;
export type ConfirmParsedInput = z.infer<typeof confirmParsedSchema>;

export interface ParsedData {
  amount: number | null;
  merchant: string | null;
  date: Date | null;
  confidence: number;
}
