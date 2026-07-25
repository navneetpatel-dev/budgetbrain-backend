import { z } from 'zod';
import { FieldLimits, type FieldLimitKey } from './limits';

function lim(key: FieldLimitKey) {
  return FieldLimits[key];
}

/** Required trimmed string with min/max from FieldLimits. */
export function requiredText(key: FieldLimitKey) {
  const { min, max } = lim(key);
  return z
    .string()
    .trim()
    .min(min, `Must be at least ${min} characters`)
    .max(max, `Must be at most ${max} characters`);
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
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined))
    .superRefine((val, ctx) => {
      if (val !== undefined && val.length < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: min,
          type: 'string',
          inclusive: true,
          message: `Must be at least ${min} characters`,
        });
      }
    });
}

export function emailField() {
  const { max } = lim('email');
  return z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(max, `Email must be at most ${max} characters`)
    .email('Enter a valid email address');
}

export function passwordField() {
  const { min, max } = lim('password');
  return z
    .string()
    .min(min, `Password must be at least ${min} characters`)
    .max(max, `Password must be at most ${max} characters`);
}

/** Login password: required + max only (no min, avoids leaking policy on failed logins). */
export function loginPasswordField() {
  const { max } = lim('password');
  return z.string().min(1, 'Password is required').max(max, `Password must be at most ${max} characters`);
}

export function otpField() {
  return z.string().trim().length(FieldLimits.otp.max, 'Enter the 6-digit code');
}

export function currencyField(optional = false) {
  const field = z.string().trim().length(3, 'Currency must be a 3-letter code');
  return optional ? field.optional() : field;
}

export function urlField(key: FieldLimitKey = 'avatarUrl') {
  const { max } = lim(key);
  return z
    .string()
    .trim()
    .max(max, `URL must be at most ${max} characters`)
    .url('Enter a valid URL')
    .optional();
}

export { FieldLimits };
