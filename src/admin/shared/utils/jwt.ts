import jwt from 'jsonwebtoken';
import type { TokenPayload } from '../types';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../config/env';

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

interface MfaPendingPayload {
  userId: string;
  purpose: 'mfa_pending';
}

/** Short-lived token identifying "this user passed password verification, TOTP still pending". */
export function generateMfaToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'mfa_pending' } satisfies MfaPendingPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: '5m',
  });
}

export function verifyMfaToken(token: string): { userId: string } {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as MfaPendingPayload;
  if (payload.purpose !== 'mfa_pending') {
    throw new Error('Invalid token purpose');
  }
  return { userId: payload.userId };
}
