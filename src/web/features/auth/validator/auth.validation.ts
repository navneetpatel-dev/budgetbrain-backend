import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceId: z.string().uuid().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const emailSchema = z.object({
  email: z.string().email(),
});

export const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  deviceId: z.string().uuid().optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export const tokenSchema = z.object({
  token: z.string(),
});

export const socialLoginSchema = z.object({
  idToken: z.string(),
  name: z.string().optional(),
});

