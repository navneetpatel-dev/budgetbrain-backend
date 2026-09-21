import { randomBytes } from 'crypto';
import { User, SsoHandoffToken, sequelize } from '@database/models';
import { hashToken } from '@shared/utils/jwt';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { issueTokens } from './auth.service';

const HANDOFF_TOKEN_EXPIRY_MS = 2 * 60 * 1000;

/**
 * Mints a short-lived, single-use token a mobile client can hand to the web app (as a URL
 * query param) to open a real logged-in web session — this is how "subscribe" on mobile
 * redirects to web checkout without ever processing payment in the app. Modeled on the
 * FamilyInvite token pattern: only a sha256 hash is stored, the raw value is the credential.
 */
export async function createSsoHandoffToken(userId: string) {
  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + HANDOFF_TOKEN_EXPIRY_MS);

  await SsoHandoffToken.create({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  return { token: rawToken, expiresAt };
}

export async function exchangeSsoHandoffToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  return sequelize.transaction(async (t) => {
    const record = await SsoHandoffToken.findOne({
      where: { tokenHash },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!record) {
      throw new AppError(404, 'Invalid handoff link', 'INVALID_HANDOFF_TOKEN');
    }
    if (record.usedAt) {
      throw new AppError(409, 'This link has already been used', 'HANDOFF_TOKEN_USED');
    }
    if (record.expiresAt < new Date()) {
      throw new AppError(410, 'This link has expired', 'HANDOFF_TOKEN_EXPIRED');
    }

    const user = await User.findByPk(record.userId, { transaction: t });
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }
    if (user.isSuspended) {
      throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
    }

    await record.update({ usedAt: new Date() }, { transaction: t });

    const tokens = await issueTokens(user, undefined, t);

    await writeAuditLog({
      action: AuditAction.AUTH_LOGIN,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      metadata: { method: 'sso_handoff' },
      transaction: t,
    });

    return tokens;
  });
}
