import { z } from 'zod';
import { registerSchema, loginSchema, refreshTokenSchema, emailSchema, otpVerifySchema, resetPasswordSchema, tokenSchema, socialLoginSchema, webauthnRegisterVerifySchema, webauthnLoginOptionsSchema, webauthnLoginVerifySchema } from '../validator/auth.validation';

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type EmailInput = z.infer<typeof emailSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type SocialLoginInput = z.infer<typeof socialLoginSchema>;
export type WebauthnRegisterVerifyInput = z.infer<typeof webauthnRegisterVerifySchema>;
export type WebauthnLoginOptionsInput = z.infer<typeof webauthnLoginOptionsSchema>;
export type WebauthnLoginVerifyInput = z.infer<typeof webauthnLoginVerifySchema>;
