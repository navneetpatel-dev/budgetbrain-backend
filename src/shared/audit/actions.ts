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
  AUTH_DEVICE_REVOKE: 'auth.device_revoke',

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
  FAMILY_GROUP_DELETE: 'family.group_delete',
  FAMILY_GROUP_JOIN: 'family.group_join',
  FAMILY_MEMBER_REMOVE: 'family.member_remove',
  FAMILY_SPLIT_CREATE: 'family.split_create',
  FAMILY_SPLIT_SETTLE: 'family.split_settle',
  FAMILY_INVITE_CREATE: 'family.invite_create',
  FAMILY_INVITE_ACCEPT: 'family.invite_accept',

  SUPPORT_TICKET_UPDATE: 'support_ticket.update',

  INTEGRATION_CONFIRM: 'integration.confirm_parsed',
  INTEGRATION_REJECT: 'integration.reject_parsed',
  INTEGRATION_CSV_IMPORT: 'integration.csv_import',

  LOAN_CREATE: 'loan.create',
  LOAN_UPDATE: 'loan.update',
  LOAN_DELETE: 'loan.delete',
  LOAN_PAY: 'loan.pay',

  RECURRING_SERIES_CREATE: 'recurring_series.create',
  RECURRING_SERIES_UPDATE: 'recurring_series.update',
  RECURRING_SERIES_DELETE: 'recurring_series.delete',

  CATEGORY_MERGE: 'category.merge',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditResource = {
  USER: 'user',
  TRANSACTION: 'transaction',
  GOAL: 'goal',
  BUDGET: 'budget',
  FAMILY_GROUP: 'family_group',
  FAMILY_MEMBER: 'family_member',
  FAMILY_SPLIT: 'family_split',
  FAMILY_INVITE: 'family_invite',
  SUPPORT_TICKET: 'support_ticket',
  PARSED_TRANSACTION: 'parsed_transaction',
  LOAN: 'loan',
  RECURRING_SERIES: 'recurring_series',
  AUTH: 'auth',
  DEVICE: 'device',
  CATEGORY: 'category',
} as const;

export type AuditResourceValue = (typeof AuditResource)[keyof typeof AuditResource];

export type AuditActorType = 'user' | 'admin' | 'system' | 'service';
export type AuditOutcome = 'success' | 'failure';
export type AuditSeverity = 'info' | 'warning' | 'critical';
export type AuditSource = 'mobile' | 'web' | 'admin' | 'system';
