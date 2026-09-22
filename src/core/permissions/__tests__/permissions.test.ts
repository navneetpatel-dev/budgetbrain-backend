import { describe, expect, it } from 'vitest';
import { hasPermission, isLifetimeAccount, Permissions } from '../permissions';

describe('account permissions', () => {
  it('grants admin access, onboarding bypass, and Pro to admin', () => {
    expect(hasPermission('admin', Permissions.ADMIN_ACCESS)).toBe(true);
    expect(hasPermission('admin', Permissions.ONBOARDING_BYPASS)).toBe(true);
    expect(hasPermission('admin', Permissions.ENTITLEMENT_PRO)).toBe(true);
  });

  it('grants Pro to lifetime without admin access', () => {
    expect(hasPermission('lifetime', Permissions.ENTITLEMENT_PRO)).toBe(true);
    expect(hasPermission('lifetime', Permissions.ADMIN_ACCESS)).toBe(false);
    expect(hasPermission('lifetime', Permissions.ONBOARDING_BYPASS)).toBe(false);
    expect(isLifetimeAccount('lifetime')).toBe(true);
  });

  it('grants nothing to free, premium, or a missing role', () => {
    for (const role of ['free', 'premium', undefined, null] as const) {
      expect(hasPermission(role, Permissions.ADMIN_ACCESS)).toBe(false);
      expect(hasPermission(role, Permissions.ONBOARDING_BYPASS)).toBe(false);
      expect(hasPermission(role, Permissions.ENTITLEMENT_PRO)).toBe(false);
    }
    expect(isLifetimeAccount('admin')).toBe(false);
  });
});
