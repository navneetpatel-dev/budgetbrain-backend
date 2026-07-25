import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  amountField,
  quantityField,
} from '../../../../validation';

export const createInvestmentSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other'], {
    errorMap: () => ({ message: 'Invalid option' }),
  }),
  symbol: optionalText('symbol'),
  quantity: quantityField(),
  purchasePrice: amountField(),
  currentPrice: amountField().optional(),
  currency: currencyField(true),
  purchaseDate: requiredDate,
});

export const updateInvestmentSchema = z.object({
  currentPrice: amountField(),
  quantity: quantityField(true),
});
