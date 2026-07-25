import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import * as authService from '../service/auth.service';
import type {
  EmailInput,
  LoginInput,
  OtpVerifyInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  SocialLoginInput,
  TokenInput,
} from '../types';

export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body as RegisterInput;
  const result = await authService.register(email, password, name);
  successResponse(res, result, 201);
}

export async function login(req: Request, res: Response) {
  const { email, password, deviceId } = req.body as LoginInput;
  const result = await authService.login(email, password, deviceId);
  successResponse(res, result);
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshTokenInput;
  const result = await authService.refresh(refreshToken);
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
  const { idToken, name } = req.body as SocialLoginInput;
  const result = await authService.socialLoginWithGoogle(idToken, name);
  successResponse(res, result);
}

export async function appleLogin(req: Request, res: Response) {
  const { idToken, name } = req.body as SocialLoginInput;
  const result = await authService.socialLoginWithApple(idToken, name);
  successResponse(res, result);
}
