/** Namespaced audit actions (resource.verb) — industry-standard taxonomy. */
export const AuditAction = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH: 'auth.refresh',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_PASSWORD_RESET_REQUEST: 'auth.password_reset_request',
  AUTH_EMAIL_VERIFY: 'auth.email_verify',
  AUTH_SOCIAL_LOGIN: 'auth.social_login',

  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_SUSPEND: 'user.suspend',
  USER_UNSUSPEND: 'user.unsuspend',
  USER_ROLE_CHANGE: 'user.role_change',

  TRANSACTION_CREATE: 'transaction.create',
  TRANSACTION_UPDATE: 'transaction.update',
  TRANSACTION_DELETE: 'transaction.delete',

  GOAL_CREATE: 'goal.create',
  GOAL_UPDATE: 'goal.update',
  GOAL_DELETE: 'goal.delete',
  GOAL_CONTRIBUTE: 'goal.contribute',

  BUDGET_CREATE: 'budget.create',
  BUDGET_UPDATE: 'budget.update',
  BUDGET_DELETE: 'budget.delete',

  FAMILY_GROUP_CREATE: 'family.group_create',
  FAMILY_GROUP_JOIN: 'family.group_join',

  SUBSCRIPTION_ACTIVATE: 'subscription.activate',
  SUBSCRIPTION_EXPIRE: 'subscription.expire',
  SUBSCRIPTION_RESTORE: 'subscription.restore',

  SUPPORT_TICKET_UPDATE: 'support_ticket.update',

  INTEGRATION_CONFIRM: 'integration.confirm_parsed',
  INTEGRATION_REJECT: 'integration.reject_parsed',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditResource = {
  USER: 'user',
  TRANSACTION: 'transaction',
  GOAL: 'goal',
  BUDGET: 'budget',
  FAMILY_GROUP: 'family_group',
  FAMILY_MEMBER: 'family_member',
  SUBSCRIPTION: 'subscription',
  SUPPORT_TICKET: 'support_ticket',
  PARSED_TRANSACTION: 'parsed_transaction',
  AUTH: 'auth',
} as const;

export type AuditResourceValue = (typeof AuditResource)[keyof typeof AuditResource];

export type AuditActorType = 'user' | 'admin' | 'system' | 'service';
export type AuditOutcome = 'success' | 'failure';
export type AuditSeverity = 'info' | 'warning' | 'critical';
export type AuditSource = 'mobile' | 'web' | 'admin' | 'system';
