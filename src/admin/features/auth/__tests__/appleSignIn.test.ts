import crypto from 'crypto';
import type { JsonWebKey } from 'crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '@config/env';
import { setupTestDb, createTestUser } from '@testHelpers';
import { hashPassword } from '../../../shared/utils/jwt';
import {
  resetAppleJwksCache,
  verifyAppleIdToken,
} from '@shared/modules/auth/service/socialAuth.service';
import { login, register, socialLoginWithApple } from '../service/auth.service';

const APPLE_AUD = 'com.budgetbrain.admin';

function generateAppleKeyPair(kid: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  return {
    kid,
    privateKey,
    jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' },
  };
}

function mockAppleJwks(jwk: object): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes('appleid.apple.com/auth/keys')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input as never);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function forgedAppleJwt(aud: string, kid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://appleid.apple.com',
      aud,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'attacker-chosen-id',
      email: 'target-admin@company.com',
    })
  ).toString('base64url');
  return `${header}.${payload}.garbage-signature`;
}

function signedAppleJwt(privateKey: crypto.KeyObject, kid: string, aud: string, email: string, sub: string): string {
  return jwt.sign(
    {
      iss: 'https://appleid.apple.com',
      aud,
      sub,
      email,
    },
    privateKey,
    { algorithm: 'RS256', keyid: kid, expiresIn: '1h' }
  );
}

describe('Admin Apple Sign-In signature verification', () => {
  const originalAppleClientId = env.APPLE_CLIENT_ID;
  let restoreFetch: (() => void) | undefined;
  const { kid, privateKey, jwk } = generateAppleKeyPair('test-kid-1');

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(() => {
    env.APPLE_CLIENT_ID = APPLE_AUD;
    resetAppleJwksCache();
    restoreFetch = mockAppleJwks(jwk);
  });

  afterEach(() => {
    env.APPLE_CLIENT_ID = originalAppleClientId;
    resetAppleJwksCache();
    restoreFetch?.();
  });

  it('rejects a syntactically valid JWT with a wrong signature', async () => {
    const token = forgedAppleJwt(APPLE_AUD, kid);
    await expect(verifyAppleIdToken(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_APPLE_TOKEN',
    });
    await expect(socialLoginWithApple(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_APPLE_TOKEN',
    });
  });

  it('accepts a genuine RS256 Apple token when JWKS matches', async () => {
    const token = signedAppleJwt(privateKey, kid, APPLE_AUD, 'admin-apple@budgetbrain.test', 'apple-sub-1');
    await expect(verifyAppleIdToken(token)).resolves.toEqual({
      appleId: 'apple-sub-1',
      email: 'admin-apple@budgetbrain.test',
    });
  });

  it('rejects tokens when APPLE_CLIENT_ID is unset (fail closed)', async () => {
    env.APPLE_CLIENT_ID = '';
    const token = signedAppleJwt(privateKey, kid, APPLE_AUD, 'admin-apple@budgetbrain.test', 'apple-sub-1');
    await expect(verifyAppleIdToken(token)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_APPLE_TOKEN',
    });
  });
});

describe('Admin auth issues tokens only to admins', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('rejects self-serve registration', async () => {
    await expect(register('new-admin@budgetbrain.test', 'CorrectHorseBattery9!')).rejects.toMatchObject({
      statusCode: 403,
      code: 'ADMIN_REGISTER_DISABLED',
    });
  });

  it('rejects password login for a non-admin user', async () => {
    const password = 'CorrectHorseBattery9!';
    const passwordHash = await hashPassword(password);
    const user = await createTestUser({ passwordHash, role: 'free' });
    await expect(login(user.email, password)).rejects.toMatchObject({
      statusCode: 403,
      code: 'ADMIN_REQUIRED',
    });
  });
});
