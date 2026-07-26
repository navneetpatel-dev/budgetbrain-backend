import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  investmentPurchaseDate,
  amountField,
  quantityField,
  enumField,
} from '../../../../shared/validation';

export const createInvestmentSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other'] as const),
  symbol: optionalText('symbol'),
  quantity: quantityField(),
  purchasePrice: amountField(),
  currentPrice: amountField().optional(),
  currency: currencyField(true),
  purchaseDate: investmentPurchaseDate,
});

export const updateInvestmentSchema = z.object({
  currentPrice: amountField(),
  quantity: quantityField(true),
});
