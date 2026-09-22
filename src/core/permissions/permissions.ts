/**
 * Account-role permissions. Family-member roles and chat message roles are a
 * different vocabulary and do not belong here.
 */
export const Permissions = {
  ADMIN_ACCESS: 'admin.access',
  ONBOARDING_BYPASS: 'onboarding.bypass',
  ENTITLEMENT_PRO: 'entitlement.pro',
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

const ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  admin: [Permissions.ADMIN_ACCESS, Permissions.ONBOARDING_BYPASS, Permissions.ENTITLEMENT_PRO],
  lifetime: [Permissions.ENTITLEMENT_PRO],
  premium: [],
  free: [],
};

export function hasPermission(role: string | null | undefined, key: PermissionKey): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(key) ?? false;
}

/** Lifetime accounts receive a lifetime plan label when role grants Pro. */
export function isLifetimeAccount(role: string | null | undefined): boolean {
  return role === 'lifetime';
}
