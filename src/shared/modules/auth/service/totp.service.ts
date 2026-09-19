import { authenticator } from 'otplib';
import { User } from '@database/models';
import { AppError } from '@shared/errors';

const ISSUER = 'BudgetBrain Admin';

/**
 * Generates a new TOTP secret for the user and stores it (not yet enabled — enabling
 * happens only once the first code is verified in confirmTotpEnrollment, so an
 * abandoned enrollment attempt never silently activates 2FA).
 */
export async function enrollTotp(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const secret = authenticator.generateSecret();
  await user.update({ totpSecret: secret });

  const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
  return { secret, otpauthUrl };
}

/** Verifies the first code against the pending secret, then activates 2FA. */
export async function confirmTotpEnrollment(userId: string, code: string): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user || !user.totpSecret) {
    throw new AppError(400, 'No pending TOTP enrollment', 'TOTP_NOT_ENROLLED');
  }

  const valid = authenticator.verify({ token: code, secret: user.totpSecret });
  if (!valid) {
    throw new AppError(401, 'Invalid verification code', 'INVALID_TOTP_CODE');
  }

  await user.update({ totpEnabled: true });
}

/** Verifies a TOTP code for a user who already has 2FA enabled (login second step). */
export async function verifyTotpCode(userId: string, code: string): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    throw new AppError(400, 'TOTP is not enabled for this account', 'TOTP_NOT_ENABLED');
  }

  const valid = authenticator.verify({ token: code, secret: user.totpSecret });
  if (!valid) {
    throw new AppError(401, 'Invalid verification code', 'INVALID_TOTP_CODE');
  }
}

/** Disables 2FA (e.g. from an account-recovery flow) — not exposed via a route yet. */
export async function disableTotp(userId: string): Promise<void> {
  await User.update({ totpEnabled: false, totpSecret: null }, { where: { id: userId } });
}
