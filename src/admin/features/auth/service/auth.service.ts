import { AppError } from '@core/http/errors';
import { hasPermission, Permissions } from '@core/permissions/permissions';
import { User } from '@database/models';
import * as sharedAuth from '@shared/modules/auth/service/auth.service';
import type { GoogleTokenInput } from '@shared/modules/auth/service/socialAuth.service';

function assertAdminRole(role: string): void {
  if (!hasPermission(role, Permissions.ADMIN_ACCESS)) {
    throw new AppError(403, 'Admin access required', 'ADMIN_REQUIRED');
  }
}

export async function register(_email: string, _password: string, _name?: string): Promise<never> {
  throw new AppError(
    403,
    'Admin registration is disabled. Contact your administrator.',
    'ADMIN_REGISTER_DISABLED'
  );
}

export async function login(email: string, password: string, deviceId?: string) {
  const result = await sharedAuth.login(email, password, deviceId);
  if ('user' in result && result.user) {
    assertAdminRole(result.user.role);
  }
  return result;
}

export async function loginMfa(mfaToken: string, code: string, deviceId?: string) {
  const result = await sharedAuth.loginMfa(mfaToken, code, deviceId);
  assertAdminRole(result.user.role);
  return result;
}

export async function refresh(token: string) {
  const result = await sharedAuth.refresh(token);
  if ('user' in result && result.user) {
    assertAdminRole(result.user.role);
  }
  return result;
}
export const refreshTokens = refresh;

export async function logout(refreshToken: string) {
  return sharedAuth.logout(refreshToken);
}

export async function requestOtp(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user || !hasPermission(user.role, Permissions.ADMIN_ACCESS)) {
    return;
  }
  if (user.totpEnabled) {
    throw new AppError(
      403,
      'This account requires password + authenticator code to sign in.',
      'TOTP_REQUIRED'
    );
  }
  return sharedAuth.requestOtp(email);
}

export async function verifyOtp(email: string, otp: string, deviceId?: string) {
  const result = await sharedAuth.verifyOtp(email, otp, deviceId);
  if ('user' in result && result.user) {
    assertAdminRole(result.user.role);
  }
  return result;
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user || !hasPermission(user.role, Permissions.ADMIN_ACCESS)) {
    return;
  }
  return sharedAuth.forgotPassword(email);
}

export async function resetPassword(token: string, newPassword: string) {
  return sharedAuth.resetPassword(token, newPassword);
}

export async function socialLoginWithGoogle(tokenInput: GoogleTokenInput, name?: string) {
  const result = await sharedAuth.socialLoginWithGoogle(tokenInput, name);
  if ('user' in result && result.user) {
    assertAdminRole(result.user.role);
  }
  return result;
}

export async function socialLoginWithApple(idToken: string, name?: string) {
  const result = await sharedAuth.socialLoginWithApple(idToken, name);
  if ('user' in result && result.user) {
    assertAdminRole(result.user.role);
  }
  return result;
}
