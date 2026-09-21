import { Request, Response } from 'express';
import type { AuthRequest } from '@shared/types';
import { AppError, successResponse } from '../../../shared/utils/errors';
import * as authService from '@shared/modules/auth/service/auth.service';
import * as ssoHandoffService from '@shared/modules/auth/service/ssoHandoff.service';
import * as webauthnService from '@shared/modules/auth/service/webauthn.service';
import type {
  EmailInput,
  LoginInput,
  OtpVerifyInput,
  RefreshTokenInput,
  RegisterInput,
  ResetPasswordInput,
  SocialLoginInput,
  TokenInput,
  WebauthnRegisterVerifyInput,
  WebauthnLoginOptionsInput,
  WebauthnLoginVerifyInput,
} from '@shared/modules/auth/types';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

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

export async function exchangeSso(req: Request, res: Response) {
  const { token } = req.body as TokenInput;
  const result = await ssoHandoffService.exchangeSsoHandoffToken(token);
  successResponse(res, result);
}

export async function googleLogin(req: Request, res: Response) {
  const input = req.body as SocialLoginInput;
  const result = await authService.socialLoginWithGoogle(input, input.name);
  successResponse(res, result);
}

export async function appleLogin(req: Request, res: Response) {
  const { idToken, token, name } = req.body as SocialLoginInput;
  const tokenToVerify = idToken || token;
  if (!tokenToVerify) {
    throw new AppError(400, 'idToken is required for Apple login', 'MISSING_APPLE_TOKEN');
  }
  const result = await authService.socialLoginWithApple(tokenToVerify, name);
  successResponse(res, result);
}

export async function getDevices(req: AuthRequest, res: Response) {
  const devices = await authService.listDevices(req.userId!);
  successResponse(res, { devices });
}

export async function revokeDevice(req: AuthRequest, res: Response) {
  await authService.revokeDevice(req.userId!, String(req.params.id));
  successResponse(res, { message: 'Device revoked successfully' });
}

export async function webauthnRegisterOptions(req: AuthRequest, res: Response) {
  const options = await webauthnService.generateRegistrationOptions(req.userId!);
  successResponse(res, options);
}

export async function webauthnRegisterVerify(req: AuthRequest, res: Response) {
  const { response, deviceLabel } = req.body as WebauthnRegisterVerifyInput;
  const result = await webauthnService.verifyRegistration(
    req.userId!,
    response as unknown as RegistrationResponseJSON,
    deviceLabel
  );
  successResponse(res, result, 201);
}

export async function webauthnLoginOptions(req: Request, res: Response) {
  const { email } = req.body as WebauthnLoginOptionsInput;
  const options = await webauthnService.generateAuthenticationOptions(email);
  successResponse(res, options);
}

export async function webauthnLoginVerify(req: Request, res: Response) {
  const { email, response, deviceId } = req.body as WebauthnLoginVerifyInput;
  const result = await webauthnService.verifyAuthentication(
    email,
    response as unknown as AuthenticationResponseJSON,
    deviceId
  );
  successResponse(res, result);
}

export async function webauthnListCredentials(req: AuthRequest, res: Response) {
  const credentials = await webauthnService.listCredentials(req.userId!);
  successResponse(res, { credentials });
}

export async function webauthnRemoveCredential(req: AuthRequest, res: Response) {
  await webauthnService.removeCredential(req.userId!, String(req.params.id));
  successResponse(res, { message: 'Passkey removed successfully' });
}
