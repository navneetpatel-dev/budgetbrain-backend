import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { authRateLimiter } from '../../../shared/middleware/rateLimit';
import { validateBody } from '../../../shared/middleware/validate';
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
  webauthnRegisterVerifySchema,
  webauthnLoginOptionsSchema,
  webauthnLoginVerifySchema,
} from '@shared/modules/auth/validator/auth.validation';

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
// Public — the handoff token itself is the credential (minted by the mobile app so its user
// can continue to web checkout already signed in). See ssoHandoff.service.ts.
router.post('/sso/exchange', validateBody(tokenSchema), asyncHandler(controller.exchangeSso));
router.post('/google', authRateLimiter, validateBody(socialLoginSchema), asyncHandler(controller.googleLogin));
router.post('/apple', authRateLimiter, validateBody(socialLoginSchema), asyncHandler(controller.appleLogin));

router.get('/devices', authenticate, asyncHandler(controller.getDevices));
router.delete('/devices/:id', authenticate, asyncHandler(controller.revokeDevice));

// WebAuthn / passkeys — web surface only. Registration is authenticated (adding a passkey to
// an already-signed-in account); login is public (this IS the sign-in step).
router.post(
  '/webauthn/register/options',
  authenticate,
  asyncHandler(controller.webauthnRegisterOptions)
);
router.post(
  '/webauthn/register/verify',
  authenticate,
  validateBody(webauthnRegisterVerifySchema),
  asyncHandler(controller.webauthnRegisterVerify)
);
router.post(
  '/webauthn/login/options',
  authRateLimiter,
  validateBody(webauthnLoginOptionsSchema),
  asyncHandler(controller.webauthnLoginOptions)
);
router.post(
  '/webauthn/login/verify',
  authRateLimiter,
  validateBody(webauthnLoginVerifySchema),
  asyncHandler(controller.webauthnLoginVerify)
);
router.get('/webauthn/credentials', authenticate, asyncHandler(controller.webauthnListCredentials));
router.delete(
  '/webauthn/credentials/:id',
  authenticate,
  asyncHandler(controller.webauthnRemoveCredential)
);

export default router;
