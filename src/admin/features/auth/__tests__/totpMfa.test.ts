import { describe, it, expect, beforeAll } from 'vitest';
import { authenticator } from 'otplib';
import { setupTestDb, createTestUser } from '@testHelpers';
import { login, loginMfa, requestOtp } from '../service/auth.service';
import { enrollTotp, confirmTotpEnrollment } from '@shared/modules/auth/service/totp.service';
import { hashPassword, generateMfaToken } from '../../../shared/utils/jwt';

const PASSWORD = 'CorrectHorseBattery9!';

async function createAdminWithPassword() {
  const passwordHash = await hashPassword(PASSWORD);
  return createTestUser({ passwordHash, role: 'admin' });
}

describe('Admin TOTP/MFA', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('enrollment generates a valid secret, otpauth URI, and QR data URL', async () => {
    const user = await createAdminWithPassword();
    const { secret, otpauthUrl, qrCodeDataUrl } = await enrollTotp(user.id);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(otpauthUrl).toContain('otpauth://totp/');
    expect(otpauthUrl).toContain(encodeURIComponent(user.email));
    expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('confirm-enrollment rejects a wrong first code and does not enable TOTP', async () => {
    const user = await createAdminWithPassword();
    await enrollTotp(user.id);

    await expect(confirmTotpEnrollment(user.id, '000000')).rejects.toThrow();

    const reloaded = await user.reload();
    expect(reloaded.totpEnabled).toBe(false);
  });

  it('confirm-enrollment accepts a correct code and enables TOTP', async () => {
    const user = await createAdminWithPassword();
    const { secret } = await enrollTotp(user.id);
    const code = authenticator.generate(secret);

    await confirmTotpEnrollment(user.id, code);

    const reloaded = await user.reload();
    expect(reloaded.totpEnabled).toBe(true);
  });

  it('login for a TOTP-enabled user returns mfaRequired instead of tokens', async () => {
    const user = await createAdminWithPassword();
    const { secret } = await enrollTotp(user.id);
    await confirmTotpEnrollment(user.id, authenticator.generate(secret));

    const result = await login(user.email, PASSWORD);
    expect(result).toHaveProperty('mfaRequired', true);
    expect(result).toHaveProperty('mfaToken');
    expect(result).not.toHaveProperty('accessToken');
  });

  it('login/mfa issues real tokens only with a valid mfaToken + valid TOTP code', async () => {
    const user = await createAdminWithPassword();
    const { secret } = await enrollTotp(user.id);
    await confirmTotpEnrollment(user.id, authenticator.generate(secret));

    const { mfaToken } = (await login(user.email, PASSWORD)) as { mfaToken: string };
    const tokens = await loginMfa(mfaToken, authenticator.generate(secret));
    expect(tokens).toHaveProperty('accessToken');
    expect(tokens).toHaveProperty('refreshToken');
  });

  it('login/mfa rejects a wrong TOTP code even with a valid mfaToken', async () => {
    const user = await createAdminWithPassword();
    const { secret } = await enrollTotp(user.id);
    await confirmTotpEnrollment(user.id, authenticator.generate(secret));

    const { mfaToken } = (await login(user.email, PASSWORD)) as { mfaToken: string };
    await expect(loginMfa(mfaToken, '000000')).rejects.toThrow();
  });

  it('login/mfa rejects an expired/tampered mfaToken even with a correct TOTP code', async () => {
    const user = await createAdminWithPassword();
    const { secret } = await enrollTotp(user.id);
    await confirmTotpEnrollment(user.id, authenticator.generate(secret));

    const tamperedToken = generateMfaToken(user.id) + 'tampered';
    await expect(loginMfa(tamperedToken, authenticator.generate(secret))).rejects.toThrow();

    // A genuinely mismatched user id in an otherwise-valid-shaped token should also fail
    // at the TOTP-enabled check rather than silently succeeding.
    const otherUsersToken = generateMfaToken('00000000-0000-0000-0000-000000000000');
    await expect(loginMfa(otherUsersToken, authenticator.generate(secret))).rejects.toThrow();
  });

  it('rejects the passwordless OTP-email login once TOTP is enabled for the account', async () => {
    const user = await createAdminWithPassword();
    const { secret } = await enrollTotp(user.id);
    await confirmTotpEnrollment(user.id, authenticator.generate(secret));

    await expect(requestOtp(user.email)).rejects.toThrow();
  });

  it('a non-TOTP account can still request OTP-email login normally', async () => {
    const user = await createAdminWithPassword();
    await expect(requestOtp(user.email)).resolves.toBeUndefined();
  });
});
