/**
 * Canonical field length limits — aligned with Sequelize STRING(n) / soft TEXT caps.
 * Used by mobile, web, and admin Zod validators for uniform validation.
 */
export const FieldLimits = {
  email: { min: 1, max: 255 },
  password: { min: 8, max: 72 },
  name: { min: 1, max: 255 },
  otp: { min: 6, max: 6 },
  token: { min: 1, max: 255 },
  refreshToken: { min: 1, max: 2048 },
  idToken: { min: 1, max: 4096 },

  country: { min: 1, max: 100 },
  currency: { min: 3, max: 3 },
  avatarUrl: { min: 1, max: 500 },
  salaryRange: { min: 1, max: 50 },
  financialGoal: { min: 1, max: 100 },

  merchant: { min: 1, max: 255 },
  notes: { min: 1, max: 2000 },
  recurringRule: { min: 1, max: 100 },
  /** Search query — FE enables at min; BE enforces same floor. */
  search: { min: 2, max: 100 },

  entityName: { min: 1, max: 255 },
  categoryName: { min: 1, max: 100 },
  icon: { min: 1, max: 50 },
  color: { min: 1, max: 20 },
  institution: { min: 1, max: 255 },
  accountNumberLast4: { min: 4, max: 4 },
  symbol: { min: 1, max: 20 },
  inviteCode: { min: 6, max: 20 },

  subject: { min: 3, max: 255 },
  message: { min: 10, max: 5000 },
  adminNotes: { min: 1, max: 5000 },

  aiMessage: { min: 1, max: 4000 },
  smsContent: { min: 10, max: 10000 },
  emailSubject: { min: 1, max: 255 },
  emailBody: { min: 10, max: 50000 },

  pushToken: { min: 1, max: 500 },
  deviceName: { min: 1, max: 255 },
  revenueCatId: { min: 1, max: 255 },
  syncResource: { min: 1, max: 100 },
  syncItemId: { min: 1, max: 64 },
  auditAction: { min: 1, max: 100 },
  auditResource: { min: 1, max: 100 },
  requestId: { min: 1, max: 64 },
  timestamp: { min: 1, max: 40 },
} as const;

/** DECIMAL(15,2) safe ceiling */
export const MAX_MONEY_AMOUNT = 9_999_999_999_999.99;

/** Investment quantity ceiling */
export const MAX_QUANTITY = 1_000_000_000;

/** Budget alert threshold (%) */
export const ALERT_THRESHOLD = { min: 1, max: 100 } as const;

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] as const;

export type FieldLimitKey = keyof typeof FieldLimits;
