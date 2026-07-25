import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody } from '../../../shared/middleware/validate';
import * as controller from '../controller/users.controller';
import { onboardingSchema, updateProfileSchema } from '../validator/user.validation';

const router = Router();
router.use(authenticate);

router.get('/me', asyncHandler(controller.getMe));
router.patch('/me', validateBody(updateProfileSchema), asyncHandler(controller.updateMe));
router.post(
  '/onboarding',
  validateBody(onboardingSchema),
  asyncHandler(controller.completeOnboarding)
);
router.delete('/me', asyncHandler(controller.deleteMe));

export default router;
