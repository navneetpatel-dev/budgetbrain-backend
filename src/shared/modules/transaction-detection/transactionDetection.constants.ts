export const DETECTION_STATUS = {
  AUTO_APPROVED: 'auto_approved',
  PENDING_REVIEW: 'pending_review',
  USER_CONFIRMED: 'user_confirmed',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
} as const;

export const DETECTION_LIMITS = {
  MAX_ITEMS_PER_BATCH: 100,
  /** Oldest transaction date accepted, in days before today (covers a 90-day inbox scan with margin). */
  MAX_AGE_DAYS: 400,
  /** Newest transaction date accepted, in days after today (time-zone slack). */
  MAX_FUTURE_DAYS: 1,
  /** Detected items one user may sync per UTC day (plan T1.7); far above any real inbox. */
  MAX_ITEMS_PER_DAY: 2000,
  /** Oldest date a statement import accepts, in days before today. */
  MAX_IMPORT_AGE_DAYS: 5 * 366,
  /** Rows one statement file may hold. */
  MAX_IMPORT_ROWS: 50_000,
  SYNC_STATE_CACHE_SECONDS: 30,
  IDEMPOTENCY_CACHE_SECONDS: 24 * 60 * 60,
  /** A pasted message or forwarded email; bank alerts are far shorter (core reads 1000 chars). */
  MAX_INGEST_TEXT_CHARS: 20_000,
  /** Diagnostics rows one upload may carry: a month of stages × reasons × banks. */
  MAX_DIAGNOSTIC_ROWS: 2000,
  MAX_SKELETONS_PER_UPLOAD: 50,
} as const;

/** Why an item is waiting for the user instead of being created (stored in review_reason). */
export const REVIEW_REASONS = {
  MEDIUM_CONFIDENCE: 'medium_confidence',
  LOW_CONFIDENCE: 'low_confidence',
  AUTO_CREATE_DISABLED: 'kill_switch',
  USER_REVIEWS_ALL: 'auto_add_disabled',
  /** An imported statement line that looks like a transaction already in the ledger. */
  POSSIBLE_DUPLICATE: 'possible_duplicate',
  /** Set on a rejected row when the user undid an added transaction (rollups count it apart). */
  UNDONE: 'undone',
} as const;

export const ERROR_MESSAGES = {
  DETECTION_NOT_FOUND: 'Detected transaction not found or access denied',
  ALREADY_PROCESSED: 'Detected transaction has already been confirmed or rejected',
  NOT_UNDOABLE: 'Only auto-added or confirmed transactions can be undone',
  INVALID_AMOUNT: 'Transaction amount must be a positive amount in the currency’s precision',
  UNSUPPORTED_CURRENCY: 'Unsupported currency',
  INVALID_DATE: 'Transaction date is outside the accepted range',
  DIRECTION_TYPE_MISMATCH: 'Transaction type does not match the money direction',
  SUBTYPE_MISMATCH: 'Subtype does not apply to this transaction type',
  CATEGORY_NOT_FOUND: 'Category not found or does not belong to user',
  ACCOUNT_NOT_FOUND: 'Financial account not found or does not belong to user',
  DETECTION_DISABLED: 'Automatic detection is currently disabled',
  DAILY_LIMIT: 'Daily limit for detected transactions reached; try again tomorrow',
} as const;

/** Subtypes that fit each type; mirrors the manual transaction validator. */
export const SUBTYPES_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  expense: ['p2p'],
  income: ['p2p'],
  refund: ['cashback', 'reversal'],
  transfer: ['card_bill', 'self_transfer', 'wallet_topup'],
};
