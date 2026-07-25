import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import { sanitizeUser } from '../../auth/service/auth.service';
import { deleteUserAccount, getUser, updateOnboarding, updateProfile } from '../service/user.service';
import type { OnboardingInput, UpdateProfileInput } from '../types';

export async function getMe(req: Request, res: Response) {
  const user = await getUser((req as AuthRequest).userId!);
  successResponse(res, sanitizeUser(user));
}

export async function updateMe(req: Request, res: Response) {
  const user = await updateProfile(
    (req as AuthRequest).userId!,
    req.body as UpdateProfileInput
  );
  successResponse(res, sanitizeUser(user));
}

export async function completeOnboarding(req: Request, res: Response) {
  const user = await updateOnboarding(
    (req as AuthRequest).userId!,
    req.body as OnboardingInput
  );
  successResponse(res, sanitizeUser(user));
}

export async function deleteMe(req: Request, res: Response) {
  await deleteUserAccount((req as AuthRequest).userId!);
  successResponse(res, { message: 'Account deleted successfully' });
}
