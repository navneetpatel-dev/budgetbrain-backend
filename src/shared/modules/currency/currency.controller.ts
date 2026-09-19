import { Request, Response } from 'express';
import { AuthRequest } from '@shared/types';
import { successResponse } from '@shared/utils/errors';
import { AppError } from '@shared/errors';
import {
  SUPPORTED_CURRENCIES,
  getExchangeRate,
  convertAmount,
  isSupportedCurrency,
} from '@shared/currency/currency.engine';

export async function getRates(req: Request, res: Response): Promise<void> {
  const user = (req as AuthRequest).user;
  const baseCurrency = (req.query.base as string)?.toUpperCase() || user?.currency || 'INR';

  if (!isSupportedCurrency(baseCurrency)) {
    throw new AppError(400, `Unsupported base currency: ${baseCurrency}`, 'INVALID_CURRENCY');
  }

  const rates: Record<string, number> = {};
  for (const curr of SUPPORTED_CURRENCIES) {
    rates[curr] = await getExchangeRate(baseCurrency, curr);
  }

  successResponse(res, {
    base: baseCurrency,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    rates,
  });
}

export async function convert(req: Request, res: Response): Promise<void> {
  const user = (req as AuthRequest).user;
  const { amount, fromCurrency, toCurrency } = req.body as {
    amount: number;
    fromCurrency: string;
    toCurrency?: string;
  };

  if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
    throw new AppError(400, 'Amount must be a non-negative number', 'INVALID_AMOUNT');
  }

  if (!fromCurrency || !isSupportedCurrency(fromCurrency)) {
    throw new AppError(400, `Unsupported fromCurrency: ${fromCurrency}`, 'INVALID_CURRENCY');
  }

  const targetCurrency = (toCurrency || user?.currency || 'INR').toUpperCase();
  if (!isSupportedCurrency(targetCurrency)) {
    throw new AppError(400, `Unsupported toCurrency: ${targetCurrency}`, 'INVALID_CURRENCY');
  }

  const convertedAmount = await convertAmount(amount, fromCurrency, targetCurrency);
  const rate = await getExchangeRate(fromCurrency, targetCurrency);

  successResponse(res, {
    originalAmount: amount,
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: targetCurrency,
    convertedAmount,
    rate,
  });
}
