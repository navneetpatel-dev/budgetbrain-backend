export const DETECTION_CONFIDENCE = {
  HIGH_THRESHOLD: 0.80,
  MEDIUM_THRESHOLD: 0.50,
} as const;

export const DETECTION_STATUS = {
  AUTO_APPROVED: 'auto_approved',
  PENDING_REVIEW: 'pending_review',
  USER_CONFIRMED: 'user_confirmed',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
} as const;

export const DETECTION_SOURCE = {
  ANDROID_SMS: 'android_sms',
  NOTIFICATION: 'notification',
  EMAIL: 'email',
  CSV: 'csv',
  BANK_API: 'bank_api',
} as const;

export const TRANSACTION_DIRECTION = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;

export const TRANSACTION_TYPE = {
  EXPENSE: 'expense',
  INCOME: 'income',
  REFUND: 'refund',
  TRANSFER: 'transfer',
} as const;

export const ERROR_MESSAGES = {
  DETECTION_NOT_FOUND: 'Detected transaction not found or access denied',
  ALREADY_PROCESSED: 'Detected transaction has already been confirmed or rejected',
  INVALID_AMOUNT: 'Transaction amount must be a positive non-zero number',
  INVALID_DATE: 'Transaction date cannot be more than 1 day in the future',
  DUPLICATE_FINGERPRINT: 'A transaction with this exact fingerprint already exists for this user',
  CATEGORY_NOT_FOUND: 'Category not found or does not belong to user',
  ACCOUNT_NOT_FOUND: 'Financial account not found or does not belong to user',
} as const;
