import { z } from 'zod';
import {
  ALERT_THRESHOLD,
  FieldLimits,
  MAX_MONEY_AMOUNT,
  MAX_QUANTITY,
  SUPPORTED_CURRENCIES,
  type FieldLimitKey,
} from './limits';
import { ValidationMessages, ValidationMessages as M } from './messages';

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

/**
 * Strong password for register / reset:
 * min–max length, no spaces, must include a letter, a number, and a special character.
 */
export function passwordField() {
  const { min, max } = lim('password');
  return z
    .string()
    .min(min, M.passwordMin())
    .max(max, M.passwordMax())
    .regex(/^\S+$/, M.passwordNoSpaces)
    .refine(
      (value) =>
        /[A-Za-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value),
      { message: M.passwordAlphanumeric }
    );
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

/** Optional start/end date query params. */
export const dateRangeSchema = z.object({
  startDate: optionalDate,
  endDate: optionalDate,
});

export const paginationSchema = z.object({
  page: z.coerce.number({ invalid_type_error: M.valueType }).int().min(1, M.pageMin).optional(),
  limit: z.coerce
    .number({ invalid_type_error: M.valueType })
    .int()
    .min(1, M.limitRange)
    .max(100, M.limitRange)
    .optional(),
});

export function uuidField() {
  return z.string().uuid(M.uuidInvalid);
}

/** String enum with catalogued invalid-option message. Pass `as const` tuples. */
export function enumField<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values as unknown as [T[number], ...T[number][]], {
    errorMap: () => ({ message: M.enumInvalid }),
  });
}

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
  const min = opts?.allowNegative ? -MAX_MONEY_AMOUNT : 0;
  return z
    .number({ invalid_type_error: M.valueType })
    .finite(M.valueFinite)
    .min(min, M.valueMin(min))
    .max(MAX_MONEY_AMOUNT, M.valueMax(MAX_MONEY_AMOUNT));
}

/** Optional money value. */
export function optionalMoneyValueField(opts?: { allowNegative?: boolean }) {
  return moneyValueField(opts).optional();
}

/** Investment quantity. */
export function quantityField(optional?: false): z.ZodNumber;
export function quantityField(optional: true): z.ZodOptional<z.ZodNumber>;
export function quantityField(optional = false) {
  const schema = z
    .number({ invalid_type_error: M.quantityType })
    .finite(M.quantityFinite)
    .positive(M.quantityPositive)
    .max(MAX_QUANTITY, M.quantityMax());
  return optional ? schema.optional() : schema;
}

/** Budget alert threshold percent (1–100). */
export function alertThresholdField(optional?: true): z.ZodOptional<z.ZodNumber>;
export function alertThresholdField(optional: false): z.ZodNumber;
export function alertThresholdField(optional = true) {
  const schema = z
    .number({ invalid_type_error: M.alertThresholdType })
    .finite(M.alertThresholdFinite)
    .min(ALERT_THRESHOLD.min, M.alertThresholdMin())
    .max(ALERT_THRESHOLD.max, M.alertThresholdMax());
  return optional ? schema.optional() : schema;
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

/** ISO / parseable timestamp string (sync payloads). */
export function timestampField() {
  const { min, max } = lim('timestamp');
  return z
    .string()
    .trim()
    .min(min, M.minChars(min))
    .max(max, M.maxChars(max))
    .refine((v) => !Number.isNaN(Date.parse(v)), M.timestampInvalid);
}

export function financialGoalsField() {
  return z
    .array(requiredText('financialGoal'))
    .min(1, M.financialGoalsMin)
    .max(20, M.financialGoalsMax);
}

export { FieldLimits, MAX_MONEY_AMOUNT, MAX_QUANTITY, ALERT_THRESHOLD, SUPPORTED_CURRENCIES, ValidationMessages };
