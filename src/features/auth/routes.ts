import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../../utils/errors';
import * as authService from './auth.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceId: z.string().uuid().optional(),
});

router.post(
  '/register',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data.email, data.password, data.name);
    successResponse(res, result, 201);
  })
);

router.post(
  '/login',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password, data.deviceId);
    successResponse(res, result);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const result = await authService.refresh(refreshToken);
    successResponse(res, result);
  })
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    await authService.logout(refreshToken);
    successResponse(res, { message: 'Logged out successfully' });
  })
);

router.post(
  '/otp/request',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await authService.requestOtp(email);
    successResponse(res, { message: 'OTP sent to email' });
  })
);

router.post(
  '/otp/verify',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ email: z.string().email(), otp: z.string().length(6), deviceId: z.string().uuid().optional() })
      .parse(req.body);
    const result = await authService.verifyOtp(data.email, data.otp, data.deviceId);
    successResponse(res, result);
  })
);

router.post(
  '/forgot-password',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await authService.forgotPassword(email);
    successResponse(res, { message: 'If the email exists, a reset link has been sent' });
  })
);

router.post(
  '/reset-password',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ token: z.string(), password: z.string().min(8) })
      .parse(req.body);
    await authService.resetPassword(data.token, data.password);
    successResponse(res, { message: 'Password reset successfully' });
  })
);

router.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    const result = await authService.verifyEmail(token);
    successResponse(res, result);
  })
);

router.post(
  '/google',
  asyncHandler(async (req, res) => {
    const data = z
      .object({ idToken: z.string(), name: z.string().optional() })
      .parse(req.body);
    const result = await authService.socialLoginWithGoogle(data.idToken, data.name);
    successResponse(res, result);
  })
);

router.post(
  '/apple',
  asyncHandler(async (req, res) => {
    const data = z
      .object({ idToken: z.string(), name: z.string().optional() })
      .parse(req.body);
    const result = await authService.socialLoginWithApple(data.idToken, data.name);
    successResponse(res, result);
  })
);

export default router;
