import {
  ALERT_THRESHOLD,
  FieldLimits,
  MAX_MONEY_AMOUNT,
  MAX_QUANTITY,
  SUPPORTED_CURRENCIES,
  type FieldLimitKey,
} from './limits';

/** Canonical validation copy — keep mobile/web/admin fieldLimits messages identical. */
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
  /** Must include a letter, a number, and a special character. */
  passwordAlphanumeric: 'Password must include a letter, a number, and a special character',
  passwordLetter: 'Password must include a letter',
  passwordNumber: 'Password must include a number',
  passwordSpecial: 'Password must include a special character',
  passwordNoSpaces: 'Password cannot contain spaces',

  otpInvalid: 'Enter the 6-digit code',

  currencyInvalid: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  dateFormat: 'Date must be YYYY-MM-DD',
  dateInvalid: 'Invalid date',
  timestampInvalid: 'Invalid timestamp',

  amountType: 'Amount must be a number',
  amountFinite: 'Amount must be a finite number',
  amountPositive: 'Amount must be greater than zero',
  amountMax: () => `Amount must be at most ${MAX_MONEY_AMOUNT}`,

  valueType: 'Value must be a number',
  valueFinite: 'Value must be a finite number',
  valueMin: (min: number) => `Value must be at least ${min}`,
  valueMax: (max: number) => `Value must be at most ${max}`,

  quantityType: 'Quantity must be a number',
  quantityFinite: 'Quantity must be a finite number',
  quantityPositive: 'Quantity must be greater than zero',
  quantityMax: () => `Quantity must be at most ${MAX_QUANTITY}`,

  alertThresholdType: 'Alert threshold must be a number',
  alertThresholdFinite: 'Alert threshold must be a finite number',
  alertThresholdMin: () => `Alert threshold must be at least ${ALERT_THRESHOLD.min}`,
  alertThresholdMax: () => `Alert threshold must be at most ${ALERT_THRESHOLD.max}`,

  inviteCodeInvalid: 'Invalid invite code',
  last4Invalid: 'Last 4 digits must be numeric',
  urlInvalid: 'Enter a valid URL',
  urlMax: (max: number) => `URL must be at most ${max} characters`,

  uuidInvalid: 'Invalid id',
  pageMin: 'Page must be at least 1',
  limitRange: 'Limit must be between 1 and 100',
  enumInvalid: 'Invalid option',

  categoryRequired: 'Please select a category',
  incomeSourceRequired: 'Select an income source',
  sortOrderRange: 'Sort order must be between 0 and 10000',
  reorderMin: 'Must include at least 1 category',
  reorderMax: 'Must be at most 200 categories',

  financialGoalsMin: 'Please select at least one financial goal',
  financialGoalsMax: 'Must be at most 20 financial goals',
  syncBatchMin: 'Must include at least 1 sync item',
  syncBatchMax: 'Must be at most 100 sync items',

  validationFailed: 'Validation failed',
} as const;
