import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createSsoHandoffToken, exchangeSsoHandoffToken } from '../service/ssoHandoff.service';
import { SsoHandoffToken } from '@database/models';

describe('SSO handoff tokens (mobile-to-web checkout redirect)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('mints a token with only its hash stored, never the raw value', async () => {
    const user = await createTestUser();

    const { token, expiresAt } = await createSsoHandoffToken(user.id);
    expect(token).toHaveLength(64); // 32 random bytes, hex-encoded
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const stored = await SsoHandoffToken.findOne({ where: { userId: user.id } });
    expect(stored).toBeDefined();
    expect(stored!.tokenHash).toHaveLength(64); // sha256 hex digest
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.usedAt).toBeNull();
  });

  it('exchanges a valid token for a real logged-in session', async () => {
    const user = await createTestUser();
    const { token } = await createSsoHandoffToken(user.id);

    const result = await exchangeSsoHandoffToken(token);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.id).toBe(user.id);

    const stored = await SsoHandoffToken.findOne({ where: { userId: user.id } });
    expect(stored!.usedAt).not.toBeNull();
  });

  it('rejects reusing an already-exchanged token', async () => {
    const user = await createTestUser();
    const { token } = await createSsoHandoffToken(user.id);

    await exchangeSsoHandoffToken(token);
    await expect(exchangeSsoHandoffToken(token)).rejects.toThrow('This link has already been used');
  });

  it('rejects an expired token', async () => {
    const user = await createTestUser();
    const { token } = await createSsoHandoffToken(user.id);

    await SsoHandoffToken.update(
      { expiresAt: new Date(Date.now() - 1000) },
      { where: { userId: user.id } }
    );

    await expect(exchangeSsoHandoffToken(token)).rejects.toThrow('This link has expired');
  });

  it('rejects a tampered/unknown token', async () => {
    await expect(exchangeSsoHandoffToken('not-a-real-token')).rejects.toThrow('Invalid handoff link');
  });

  it('rejects a token for a suspended account', async () => {
    const user = await createTestUser({ isSuspended: true });
    const { token } = await createSsoHandoffToken(user.id);

    await expect(exchangeSsoHandoffToken(token)).rejects.toThrow('Account suspended');
  });
});
