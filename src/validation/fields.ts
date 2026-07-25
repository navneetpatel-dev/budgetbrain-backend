import { z } from 'zod';
import {
  FieldLimits,
  MAX_MONEY_AMOUNT,
  SUPPORTED_CURRENCIES,
  type FieldLimitKey,
} from './limits';
import { ValidationMessages as M } from './messages';

function lim(key: FieldLimitKey) {
  return FieldLimits[key];
}

/** Required trimmed string with min/max from FieldLimits. */
export function requiredText(key: FieldLimitKey) {
  const { min, max } = lim(key);
  return z
    .string()
    .trim()
    .min(min, M.minChars(min))
    .max(max, M.maxChars(max));
}

/**
 * Optional trimmed string. Empty string → undefined.
 * If a non-empty value is provided, min/max are enforced.
 */
export function optionalText(key: FieldLimitKey) {
  const { min, max } = lim(key);
  return z
    .string()
    .trim()
    .max(max, M.maxChars(max))
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined))
    .superRefine((val, ctx) => {
      if (val !== undefined && val.length < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: min,
          type: 'string',
          inclusive: true,
          message: M.minChars(min),
        });
      }
    });
}

export function emailField() {
  const { max } = lim('email');
  return z
    .string()
    .trim()
    .min(1, M.emailRequired)
    .max(max, M.emailMax())
    .email(M.emailInvalid)
    .transform((value) => value.toLowerCase());
}

export function passwordField() {
  const { min, max } = lim('password');
  return z
    .string()
    .min(min, M.passwordMin())
    .max(max, M.passwordMax())
    .regex(/[A-Za-z]/, M.passwordLetter)
    .regex(/[0-9]/, M.passwordNumber);
}

/** Login password: required + max only (no complexity leak on failed logins). */
export function loginPasswordField() {
  const { max } = lim('password');
  return z.string().min(1, M.passwordRequired).max(max, M.passwordMax());
}

export function otpField() {
  return z.string().trim().regex(/^\d{6}$/, M.otpInvalid);
}

const currencyEnum = z.enum(SUPPORTED_CURRENCIES, {
  errorMap: () => ({ message: M.currencyInvalid }),
});

export function currencyField(optional = false) {
  if (optional) {
    return z.preprocess((value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (typeof value === 'string') return value.trim().toUpperCase();
      return value;
    }, currencyEnum.optional()) as z.ZodType<(typeof SUPPORTED_CURRENCIES)[number] | undefined>;
  }

  return z.preprocess((value) => {
    if (typeof value === 'string') return value.trim().toUpperCase();
    return value;
  }, currencyEnum) as z.ZodType<(typeof SUPPORTED_CURRENCIES)[number]>;
}

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, M.dateFormat)
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, M.dateInvalid);

export function dateField(optional = false) {
  return optional ? isoDateSchema.optional() : isoDateSchema;
}

/** Required YYYY-MM-DD date. */
export const requiredDate = isoDateSchema;
/** Optional YYYY-MM-DD date. */
export const optionalDate = isoDateSchema.optional();

/** Positive money amount within DECIMAL(15,2) range. */
export function amountField() {
  return z
    .number({ invalid_type_error: M.amountType })
    .finite(M.amountFinite)
    .positive(M.amountPositive)
    .max(MAX_MONEY_AMOUNT, M.amountMax());
}

/** Required money value (allows zero; set allowNegative for credit balances). */
export function moneyValueField(opts?: { allowNegative?: boolean }) {
  return z
    .number({ invalid_type_error: M.valueType })
    .finite(M.valueFinite)
    .min(opts?.allowNegative ? -MAX_MONEY_AMOUNT : 0)
    .max(MAX_MONEY_AMOUNT);
}

/** Optional money value. */
export function optionalMoneyValueField(opts?: { allowNegative?: boolean }) {
  return moneyValueField(opts).optional();
}

export function inviteCodeField() {
  return z.string().trim().regex(/^[a-fA-F0-9]{6,20}$/, M.inviteCodeInvalid);
}

export function accountLast4Field() {
  return z.string().trim().regex(/^\d{4}$/, M.last4Invalid).optional();
}

export function urlField(key: FieldLimitKey = 'avatarUrl') {
  const { max } = lim(key);
  return z
    .string()
    .trim()
    .max(max, M.urlMax(max))
    .url(M.urlInvalid)
    .optional();
}

export { FieldLimits, MAX_MONEY_AMOUNT, SUPPORTED_CURRENCIES, ValidationMessages };
