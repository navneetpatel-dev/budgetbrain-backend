import { z } from 'zod';
import {
  emailField,
  passwordField,
  loginPasswordField,
  otpField,
  requiredText,
  optionalText,
  uuidField,
} from '@shared/validation';

export const registerSchema = z.object({
  email: emailField(),
  password: passwordField(),
  name: requiredText('name'),
});

export const loginSchema = z.object({
  email: emailField(),
  password: loginPasswordField(),
  deviceId: uuidField().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: requiredText('refreshToken'),
});

export const emailSchema = z.object({
  email: emailField(),
});

export const otpVerifySchema = z.object({
  email: emailField(),
  otp: otpField(),
  deviceId: uuidField().optional(),
});

export const resetPasswordSchema = z.object({
  token: requiredText('token'),
  password: passwordField(),
});

export const tokenSchema = z.object({
  token: requiredText('token'),
});

// WebAuthn request/response payloads are the browser's own PublicKeyCredential JSON shape
// (RegistrationResponseJSON / AuthenticationResponseJSON) — @simplewebauthn/server's own
// verify*Response() calls are the real structural validation, so these schemas only guard the
// envelope fields this endpoint layer actually branches on.
export const webauthnRegisterVerifySchema = z.object({
  response: z.record(z.string(), z.unknown()),
  deviceLabel: z.string().trim().max(255).optional(),
});

export const webauthnLoginOptionsSchema = z.object({
  email: emailField(),
});

export const webauthnLoginVerifySchema = z.object({
  email: emailField(),
  response: z.record(z.string(), z.unknown()),
  deviceId: uuidField().optional(),
});

export const socialLoginSchema = z
  .object({
    idToken: optionalText('idToken'),
    token: z.string().trim().optional(),
    accessToken: z.string().trim().optional(),
    code: z.string().trim().optional(),
    redirectUri: z.string().trim().optional(),
    /** Apple only sends the name on the first authorize. */
    name: optionalText('name'),
  })
  .refine((data) => Boolean(data.idToken || data.token || data.accessToken || data.code), {
    message: 'idToken, token, accessToken, or code is required',
  });
