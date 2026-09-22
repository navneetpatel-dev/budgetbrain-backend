import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestDevice } from '@testHelpers';
import { refresh, listDevices, revokeDevice } from '../service/auth.service';
import { generateRefreshToken, hashToken } from '@core/auth/jwt';
import { RefreshToken } from '@database/models';

describe('Auth Security - Token Rotation & Device Revocation', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    it('rotates refresh token on valid refresh call', async () => {
      const user = await createTestUser();
      const rawToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });
      const tokenHash = hashToken(rawToken);

      await RefreshToken.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });

      const newTokens = await refresh(rawToken);
      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');

      // Old token should now be revoked
      const oldTokenRecord = await RefreshToken.findOne({ where: { tokenHash } });
      expect(oldTokenRecord!.revokedAt).not.toBeNull();
    });

    it('detects token reuse and revokes all user tokens (TOKEN_COMPROMISED)', async () => {
      const user = await createTestUser();
      const rawToken = generateRefreshToken({ userId: user.id, email: 'revoked@test.com', role: 'free' });
      const tokenHash = hashToken(rawToken);

      // Create already revoked token
      await RefreshToken.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        revokedAt: new Date(),
      });

      // Create an active legitimate token for same user with distinct hash
      const rawActiveToken = generateRefreshToken({ userId: user.id, email: 'active@test.com', role: 'free' });
      const activeHash = hashToken(rawActiveToken);
      await RefreshToken.create({
        userId: user.id,
        tokenHash: activeHash,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        revokedAt: null,
      });

      // Attempt to reuse revoked token
      await expect(refresh(rawToken)).rejects.toThrow(
        'Compromised refresh token detected. All sessions revoked.'
      );

      // Check that the active legitimate token was also revoked
      const activeTokenRecord = await RefreshToken.findOne({ where: { tokenHash: activeHash } });
      expect(activeTokenRecord!.revokedAt).not.toBeNull();
    });
  });

  describe('Device Listing and Revocation', () => {
    it('lists devices and revokes device session with associated refresh tokens', async () => {
      const user = await createTestUser();
      const device = await createTestDevice(user.id, { deviceName: 'MacBook Pro' });

      // Create token linked to device
      const rawToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });
      const tokenHash = hashToken(rawToken);
      await RefreshToken.create({
        userId: user.id,
        deviceId: device.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });

      // List devices
      const devices = await listDevices(user.id);
      expect(devices.some((d) => d.id === device.id)).toBe(true);

      // Revoke device
      await revokeDevice(user.id, device.id);

      // Device should be deleted
      const remainingDevices = await listDevices(user.id);
      expect(remainingDevices.some((d) => d.id === device.id)).toBe(false);

      // Associated tokens revoked
      const token = await RefreshToken.findOne({ where: { tokenHash } });
      expect(token!.revokedAt).not.toBeNull();
    });
  });
});
