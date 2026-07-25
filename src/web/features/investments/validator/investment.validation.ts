import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
} from '../../../../validation';

export const createInvestmentSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other']),
  symbol: optionalText('symbol'),
  quantity: z.number().finite().positive().max(1_000_000_000),
  purchasePrice: amountField(),
  currentPrice: amountField().optional(),
  currency: currencyField(true),
  purchaseDate: requiredDate,
});

export const updateInvestmentSchema = z.object({
  currentPrice: amountField(),
  quantity: z.number().finite().positive().max(1_000_000_000).optional(),
});
