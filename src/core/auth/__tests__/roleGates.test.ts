import { describe, expect, it } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError } from '@shared/errors';
import { requireAdmin } from '../requireAdmin';
import { requireOnboarding } from '../requireOnboarding';

function run(
  gate: (req: AuthRequest, res: Response, next: NextFunction) => void,
  user?: { role: string; onboardingCompleted?: boolean }
): { called: boolean; error?: AppError } {
  let called = false;
  let error: AppError | undefined;
  const req = { user } as AuthRequest;
  gate(req, {} as Response, (err) => {
    called = true;
    if (err) error = err as AppError;
  });
  return { called, error };
}

describe('role gates', () => {
  it('requireAdmin allows admin and rejects everyone else', () => {
    expect(run(requireAdmin, { role: 'admin' })).toEqual({ called: true, error: undefined });

    const rejected = run(requireAdmin, { role: 'free' });
    expect(rejected.called).toBe(true);
    expect(rejected.error).toBeInstanceOf(AppError);
    expect(rejected.error?.statusCode).toBe(403);
    expect(rejected.error?.code).toBe('ADMIN_REQUIRED');
  });

  it('requireOnboarding lets admins through and blocks unfinished profiles', () => {
    expect(run(requireOnboarding, { role: 'admin', onboardingCompleted: false })).toEqual({
      called: true,
      error: undefined,
    });

    const blocked = run(requireOnboarding, { role: 'free', onboardingCompleted: false });
    expect(blocked.error?.statusCode).toBe(403);
    expect(blocked.error?.code).toBe('ONBOARDING_REQUIRED');

    expect(run(requireOnboarding, { role: 'free', onboardingCompleted: true }).error).toBeUndefined();
  });
});
