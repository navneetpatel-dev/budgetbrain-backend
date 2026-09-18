export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  IN_GRACE_PERIOD: 'in_grace_period',
  IN_BILLING_RETRY: 'in_billing_retry',
} as const;

export const SUBSCRIPTION_PLAN = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  LIFETIME: 'lifetime',
} as const;

export const PLAN_PRICES_INR = {
  monthly: 199,
  yearly: 1499,
  lifetime: 3999,
} as const;

export const ENTITLEMENTS = {
  PRO: 'pro',
} as const;
