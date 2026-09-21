import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '@shared/errors';
import { env } from '@config/env';
import { logger } from '@shared/logging/logger';

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

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let appleKeysCache: AppleJwk[] | null = null;
let appleKeysCacheExpiry = 0;

async function getAppleSigningKey(kid: string): Promise<crypto.KeyObject | null> {
  const now = Date.now();
  if (!appleKeysCache || now > appleKeysCacheExpiry) {
    try {
      const res = await fetch('https://appleid.apple.com/auth/keys');
      if (res.ok) {
        const data = (await res.json()) as { keys: AppleJwk[] };
        appleKeysCache = data.keys;
        appleKeysCacheExpiry = now + 24 * 60 * 60 * 1000;
      }
    } catch {
      // In offline / test mode
    }
  }

  const jwk = appleKeysCache?.find((k) => k.kid === kid);
  if (!jwk) return null;

  try {
    return crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
  } catch {
    return null;
  }
}

function allowedAppleClientIds(): string[] {
  return (env.APPLE_CLIENT_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function allowedGoogleClientIds(): string[] {
  return (env.GOOGLE_CLIENT_ID ?? '')
    .split(',')
    .map((id) => id.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function audienceMatches(
  aud: string | string[] | undefined,
  allowed: string[],
  envVarName: string
): boolean {
  if (!allowed.length) {
    logger.error(
      `${envVarName} is not configured; rejecting social-login token (fail closed)`
    );
    return false;
  }
  if (!aud) return false;
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((value) => allowed.includes(value));
}

/** Test-only: drop the in-memory Apple JWKS cache so mocked keys are fetched. */
export function resetAppleJwksCache(): void {
  appleKeysCache = null;
  appleKeysCacheExpiry = 0;
}

export type GoogleTokenInput =
  | string
  | {
      token?: string;
      idToken?: string;
      accessToken?: string;
      code?: string;
      redirectUri?: string;
      name?: string;
    };

export async function verifyGoogleIdToken(
  input: GoogleTokenInput
): Promise<{ googleId: string; email: string; name?: string }> {
  let token: string | undefined;
  let code: string | undefined;
  let redirectUri: string | undefined;
  let explicitName: string | undefined;

  if (typeof input === 'string') {
    token = input;
  } else if (input && typeof input === 'object') {
    token = input.idToken || input.token || input.accessToken;
    code = input.code;
    redirectUri = input.redirectUri;
    explicitName = input.name;
  }

  // If authorization code is passed, exchange with Google token endpoint
  if (!token && code) {
    const allowed = allowedGoogleClientIds();
    const clientId = allowed[0] ?? '';
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri ?? '',
    });
    if (env.GOOGLE_CLIENT_SECRET) {
      body.append('client_secret', env.GOOGLE_CLIENT_SECRET);
    }
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      throw new AppError(401, 'Failed to exchange Google authorization code', 'INVALID_GOOGLE_CODE');
    }
    const tokenData = (await tokenRes.json()) as { id_token?: string; access_token?: string };
    token = tokenData.id_token || tokenData.access_token;
  }

  if (!token) {
    throw new AppError(400, 'Google token or code is required', 'MISSING_GOOGLE_TOKEN');
  }

  let data: (GoogleTokenInfo & { aud?: string | string[]; azp?: string; error?: string }) | null = null;

  // 1. Try Google tokeninfo with id_token
  const idTokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (idTokenRes.ok) {
    data = (await idTokenRes.json()) as GoogleTokenInfo & { aud?: string | string[]; azp?: string; error?: string };
  } else {
    // 2. Fallback to tokeninfo with access_token
    const accessTokenRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (accessTokenRes.ok) {
      data = (await accessTokenRes.json()) as GoogleTokenInfo & { aud?: string | string[]; azp?: string; error?: string };
    }
  }

  // 3. Fallback to userinfo endpoint with Bearer header
  if (!data || data.error || !data.sub || !data.email) {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (userInfoRes.ok) {
      const userInfo = (await userInfoRes.json()) as { sub?: string; email?: string; name?: string; aud?: string };
      if (userInfo.sub && userInfo.email) {
        data = {
          sub: userInfo.sub,
          email: userInfo.email,
          name: userInfo.name,
          aud: userInfo.aud,
        };
      }
    }
  }

  if (!data || data.error || !data.sub || !data.email) {
    throw new AppError(401, 'Invalid Google token', 'INVALID_GOOGLE_TOKEN');
  }

  // 4. If name wasn't in tokeninfo, fetch from userinfo
  let resolvedName = explicitName ?? data.name;
  if (!resolvedName) {
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = (await userInfoRes.json()) as { name?: string };
        if (userInfo.name) resolvedName = userInfo.name;
      }
    } catch {
      // Name is optional
    }
  }

  // 5. Audience check — fail closed when GOOGLE_CLIENT_ID is unset.
  const allowed = allowedGoogleClientIds();
  const matchesAud = audienceMatches(data.aud, allowed, 'GOOGLE_CLIENT_ID');
  const matchesAzp = data.azp ? allowed.includes(data.azp) : false;
  if (!matchesAud && !matchesAzp) {
    throw new AppError(401, 'Google token audience mismatch', 'INVALID_GOOGLE_TOKEN');
  }

  return { googleId: data.sub, email: data.email, name: resolvedName };
}

export async function verifyAppleIdToken(
  idToken: string
): Promise<{ appleId: string; email?: string }> {
  const decodedHeader = jwt.decode(idToken, { complete: true });
  const kid = decodedHeader && typeof decodedHeader === 'object' ? decodedHeader.header.kid : null;

  let payload: AppleIdTokenPayload;

  if (kid) {
    const publicKey = await getAppleSigningKey(kid);
    if (publicKey) {
      try {
        payload = jwt.verify(idToken, publicKey, {
          algorithms: ['RS256'],
          issuer: 'https://appleid.apple.com',
        }) as unknown as AppleIdTokenPayload;
      } catch (err: any) {
        throw new AppError(401, `Apple token verification failed: ${err.message}`, 'INVALID_APPLE_TOKEN');
      }
    } else {
      throw new AppError(401, 'Apple signing key not found', 'INVALID_APPLE_TOKEN');
    }
  } else {
    throw new AppError(401, 'Invalid Apple token header', 'INVALID_APPLE_TOKEN');
  }

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
  if (!audienceMatches(payload.aud, allowed, 'APPLE_CLIENT_ID')) {
    throw new AppError(401, 'Apple token audience mismatch', 'INVALID_APPLE_TOKEN');
  }

  return { appleId: payload.sub, email: payload.email };
}
