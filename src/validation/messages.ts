import { FieldLimits, MAX_MONEY_AMOUNT, SUPPORTED_CURRENCIES, type FieldLimitKey } from './limits';

/** Canonical validation copy — keep mobile/web fieldLimits messages identical. */
export const ValidationMessages = {
  minChars: (min: number) => `Must be at least ${min} characters`,
  maxChars: (max: number) => `Must be at most ${max} characters`,
  fieldMin: (key: FieldLimitKey) => ValidationMessages.minChars(FieldLimits[key].min),
  fieldMax: (key: FieldLimitKey) => ValidationMessages.maxChars(FieldLimits[key].max),

  emailRequired: 'Email is required',
  emailMax: () => `Email must be at most ${FieldLimits.email.max} characters`,
  emailInvalid: 'Enter a valid email address',

  passwordRequired: 'Password is required',
  passwordMin: () => `Password must be at least ${FieldLimits.password.min} characters`,
  passwordMax: () => `Password must be at most ${FieldLimits.password.max} characters`,
  passwordLetter: 'Password must include a letter',
  passwordNumber: 'Password must include a number',

  otpInvalid: 'Enter the 6-digit code',

  currencyInvalid: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  dateFormat: 'Date must be YYYY-MM-DD',
  dateInvalid: 'Invalid date',

  amountType: 'Amount must be a number',
  amountFinite: 'Amount must be a finite number',
  amountPositive: 'Amount must be greater than zero',
  amountMax: () => `Amount must be at most ${MAX_MONEY_AMOUNT}`,

  valueType: 'Value must be a number',
  valueFinite: 'Value must be a finite number',

  inviteCodeInvalid: 'Invalid invite code',
  last4Invalid: 'Last 4 digits must be numeric',
  urlInvalid: 'Enter a valid URL',
  urlMax: (max: number) => `URL must be at most ${max} characters`,

  validationFailed: 'Validation failed',
} as const;
