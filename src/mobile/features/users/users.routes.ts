import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { requireOnboarding } from '@core/auth/requireOnboarding';
import { validateBody } from '@core/middleware/validate';
import * as controller from './users.controller';
import { onboardingSchema, updateProfileSchema } from '@shared/modules/users/users.validator';

const router = Router();
router.use(authenticate);

router.get('/me', asyncHandler(controller.getMe));
router.patch('/me', requireOnboarding, validateBody(updateProfileSchema), asyncHandler(controller.updateMe));
router.post(
  '/onboarding',
  validateBody(onboardingSchema),
  asyncHandler(controller.completeOnboarding)
);
router.delete('/me', asyncHandler(controller.deleteMe));

export default router;
