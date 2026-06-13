import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { sanitizeUser } from '../auth/auth.service';
import { getUser, updateProfile, updateOnboarding, deleteUserAccount } from './user.service';
import { updateProfileSchema, onboardingSchema } from './user.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getUser((req as AuthRequest).userId!);
    successResponse(res, sanitizeUser(user));
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const data = updateProfileSchema.parse(req.body);
    const user = await updateProfile((req as AuthRequest).userId!, data);
    successResponse(res, sanitizeUser(user));
  })
);

router.post(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const data = onboardingSchema.parse(req.body);
    const user = await updateOnboarding((req as AuthRequest).userId!, data);
    successResponse(res, sanitizeUser(user));
  })
);

router.delete(
  '/me',
  asyncHandler(async (req, res) => {
    await deleteUserAccount((req as AuthRequest).userId!);
    successResponse(res, { message: 'Account deleted successfully' });
  })
);

export default router;
