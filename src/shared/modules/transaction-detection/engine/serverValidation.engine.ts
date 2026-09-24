import { isAllowedDirectionType, isSupportedCurrency, parseDecimalToMinor } from '@budgetbrain/detection-core';
import type { DetectedItemInput } from '../transactionDetection.types';
import { DETECTION_LIMITS, ERROR_MESSAGES, SUBTYPES_BY_TYPE } from '../transactionDetection.constants';

export interface ServerValidationResult {
  isValid: boolean;
  error?: string;
  /** Amount in minor units, when valid. */
  amountMinor?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Semantic checks on one detected item after the schema has accepted its shape
 * (plan task T1.4, spec §21). The server never trusts the client's classification:
 * a debit can't be income, a subtype must fit its type, the amount must be representable in
 * its currency, and the date must fall in a plausible window.
 *
 * `today` is injectable for tests; it is a UTC calendar date `YYYY-MM-DD`.
 */
export function validateServerDetectedPayload(
  item: DetectedItemInput,
  today: string = new Date().toISOString().slice(0, 10),
  options: { maxAgeDays?: number } = {}
): ServerValidationResult {
  if (!isSupportedCurrency(item.currency)) {
    return { isValid: false, error: ERROR_MESSAGES.UNSUPPORTED_CURRENCY };
  }

  let amountMinor: number;
  try {
    amountMinor = parseDecimalToMinor(item.amount, item.currency);
  } catch {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_AMOUNT };
  }
  if (amountMinor <= 0) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_AMOUNT };
  }

  if (!isAllowedDirectionType(item.direction, item.transactionType)) {
    return { isValid: false, error: ERROR_MESSAGES.DIRECTION_TYPE_MISMATCH };
  }

  if (item.subtype !== null && !(SUBTYPES_BY_TYPE[item.transactionType] ?? []).includes(item.subtype)) {
    return { isValid: false, error: ERROR_MESSAGES.SUBTYPE_MISMATCH };
  }

  const txDay = Date.parse(`${item.transactionDate}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (
    Number.isNaN(txDay) ||
    new Date(txDay).toISOString().slice(0, 10) !== item.transactionDate || // rejects 2026-02-30
    txDay > todayMs + DETECTION_LIMITS.MAX_FUTURE_DAYS * DAY_MS ||
    txDay < todayMs - (options.maxAgeDays ?? DETECTION_LIMITS.MAX_AGE_DAYS) * DAY_MS
  ) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_DATE };
  }

  return { isValid: true, amountMinor };
}
