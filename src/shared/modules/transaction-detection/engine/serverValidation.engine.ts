import type { NormalizedDetectedPayload } from '../transactionDetection.types';
import { ERROR_MESSAGES } from '../transactionDetection.constants';

export interface ServerValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateServerDetectedPayload(
  payload: NormalizedDetectedPayload
): ServerValidationResult {
  if (typeof payload.amount !== 'number' || isNaN(payload.amount) || payload.amount <= 0) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_AMOUNT };
  }

  const txDate = new Date(payload.transactionDate);
  if (isNaN(txDate.getTime())) {
    return { isValid: false, error: 'Invalid transaction date format' };
  }

  // Reject transactions dated more than 24 hours into the future
  const now = new Date();
  const maxFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (txDate.getTime() > maxFuture.getTime()) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_DATE };
  }

  return { isValid: true };
}
