import { AppError } from '../../../shared/utils/errors';
import { env } from '../../../shared/config/env';

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified?: string;
  name?: string;
}

interface AppleIdTokenPayload {
  sub: string;
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AppError(401, 'Invalid token format', 'INVALID_TOKEN');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload) as Record<string, unknown>;
}

function allowedAppleClientIds(): string[] {
  return (env.APPLE_CLIENT_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function audienceMatches(aud: string | string[] | undefined, allowed: string[]): boolean {
  if (!allowed.length) return true;
  if (!aud) return false;
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((value) => allowed.includes(value));
}

export async function verifyGoogleIdToken(idToken: string): Promise<{ googleId: string; email: string; name?: string }> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    throw new AppError(401, 'Invalid Google token', 'INVALID_GOOGLE_TOKEN');
  }

  const data = (await response.json()) as GoogleTokenInfo & { aud?: string; error?: string };
  if (data.error || !data.sub || !data.email) {
    throw new AppError(401, 'Invalid Google token', 'INVALID_GOOGLE_TOKEN');
  }

  if (env.GOOGLE_CLIENT_ID && data.aud !== env.GOOGLE_CLIENT_ID) {
    throw new AppError(401, 'Google token audience mismatch', 'INVALID_GOOGLE_TOKEN');
  }

  return { googleId: data.sub, email: data.email, name: data.name };
}

export async function verifyAppleIdToken(
  idToken: string
): Promise<{ appleId: string; email?: string }> {
  const payload = decodeJwtPayload(idToken) as unknown as AppleIdTokenPayload;

  if (payload.iss !== 'https://appleid.apple.com') {
    throw new AppError(401, 'Invalid Apple token issuer', 'INVALID_APPLE_TOKEN');
  }

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new AppError(401, 'Apple token expired', 'INVALID_APPLE_TOKEN');
  }

  if (!payload.sub) {
    throw new AppError(401, 'Invalid Apple token', 'INVALID_APPLE_TOKEN');
  }

  const allowed = allowedAppleClientIds();
  if (!audienceMatches(payload.aud, allowed)) {
    throw new AppError(401, 'Apple token audience mismatch', 'INVALID_APPLE_TOKEN');
  }

  return { appleId: payload.sub, email: payload.email };
}
