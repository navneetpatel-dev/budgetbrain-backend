import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { authRateLimiter } from '../../../../shared/middleware/rateLimit';
import { validateBody } from '../../../../shared/middleware/validate';
import * as controller from '../controller/auth.controller';
import {
  emailSchema,
  loginSchema,
  otpVerifySchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  socialLoginSchema,
  tokenSchema,
} from '../validator/auth.validation';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  asyncHandler(controller.register)
);
router.post('/login', authRateLimiter, validateBody(loginSchema), asyncHandler(controller.login));
router.post('/refresh', validateBody(refreshTokenSchema), asyncHandler(controller.refresh));
router.post(
  '/logout',
  authenticate,
  validateBody(refreshTokenSchema),
  asyncHandler(controller.logout)
);
router.post(
  '/otp/request',
  authRateLimiter,
  validateBody(emailSchema),
  asyncHandler(controller.requestOtp)
);
router.post(
  '/otp/verify',
  authRateLimiter,
  validateBody(otpVerifySchema),
  asyncHandler(controller.verifyOtp)
);
router.post(
  '/forgot-password',
  authRateLimiter,
  validateBody(emailSchema),
  asyncHandler(controller.forgotPassword)
);
router.post(
  '/reset-password',
  authRateLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(controller.resetPassword)
);
router.post('/verify-email', validateBody(tokenSchema), asyncHandler(controller.verifyEmail));
router.post('/google', validateBody(socialLoginSchema), asyncHandler(controller.googleLogin));
router.post('/apple', validateBody(socialLoginSchema), asyncHandler(controller.appleLogin));

export default router;
