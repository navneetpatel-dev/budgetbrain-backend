import { z } from 'zod';
import {
  emailField,
  passwordField,
  loginPasswordField,
  otpField,
  requiredText,
  uuidField,
} from '../../../../shared/validation';

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

export const socialLoginSchema = z.object({
  idToken: requiredText('idToken'),
  name: requiredText('name'),
});
