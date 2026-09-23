import { Request, Response } from 'express';
import { AppError, successResponse } from '@core/http/errors';
import type { AuthRequest } from '../../shared/types/index';
import * as authService from '@shared/modules/auth/service/auth.service';
import * as totpService from '@shared/modules/auth/service/totp.service';
import { hasPermission, Permissions } from '@core/permissions/permissions';
import type {
  EmailInput,
  LoginInput,
  OtpVerifyInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  SocialLoginInput,
  TokenInput,
} from '@shared/modules/auth/auth.types';

function assertAdminRole(role: string): void {
  if (!hasPermission(role, Permissions.ADMIN_ACCESS)) {
    throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED');
  }
}

export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body as RegisterInput;
  const result = await authService.register(email, password, name);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result, 201);
}

export async function login(req: Request, res: Response) {
  const { email, password, deviceId } = req.body as LoginInput;
  const result = await authService.login(email, password, deviceId);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result);
}

export async function me(req: Request, res: Response) {
  const user = (req as AuthRequest).user!;
  assertAdminRole(user.role);
  successResponse(res, authService.sanitizeUser(user));
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshTokenInput;
  const result = await authService.refresh(refreshToken);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshTokenInput;
  await authService.logout(refreshToken);
  successResponse(res, { message: 'Logged out successfully' });
}

export async function requestOtp(req: Request, res: Response) {
  const { email } = req.body as EmailInput;
  await authService.requestOtp(email);
  successResponse(res, { message: 'OTP sent to email' });
}

export async function verifyOtp(req: Request, res: Response) {
  const { email, otp, deviceId } = req.body as OtpVerifyInput;
  const result = await authService.verifyOtp(email, otp, deviceId);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result);
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as EmailInput;
  await authService.forgotPassword(email);
  successResponse(res, { message: 'If the email exists, a reset link has been sent' });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body as ResetPasswordInput;
  await authService.resetPassword(token, password);
  successResponse(res, { message: 'Password reset successfully' });
}

export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.body as TokenInput;
  const result = await authService.verifyEmail(token);
  successResponse(res, result);
}

export async function googleLogin(req: Request, res: Response) {
  const input = req.body as SocialLoginInput;
  const result = await authService.socialLoginWithGoogle(input, input.name);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result);
}

export async function appleLogin(req: Request, res: Response) {
  const { idToken, token, name } = req.body as SocialLoginInput;
  const tokenToVerify = idToken || token;
  if (!tokenToVerify) {
    throw new AppError(400, 'idToken is required for Apple login', 'MISSING_APPLE_TOKEN');
  }
  const result = await authService.socialLoginWithApple(tokenToVerify, name);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result);
}

export async function loginMfa(req: Request, res: Response) {
  const { mfaToken, code, deviceId } = req.body as { mfaToken: string; code: string; deviceId?: string };
  const result = await authService.loginMfa(mfaToken, code, deviceId);
  if ('user' in result) {
    assertAdminRole(result.user.role);
  }
  successResponse(res, result);
}

export async function enrollTotp(req: Request, res: Response) {
  const user = (req as AuthRequest).user!;
  assertAdminRole(user.role);
  const result = await totpService.enrollTotp(user.id);
  successResponse(res, result);
}

export async function confirmTotp(req: Request, res: Response) {
  const user = (req as AuthRequest).user!;
  assertAdminRole(user.role);
  const { code } = req.body as { code: string };
  await totpService.confirmTotpEnrollment(user.id, code);
  successResponse(res, { message: 'Two-factor authentication enabled' });
}
