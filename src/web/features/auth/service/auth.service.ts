import { Op, Transaction as DbTransaction } from 'sequelize';
import {
  User,
  RefreshToken,
  Category,
  DEFAULT_CATEGORIES,
  VerificationToken,
  TokenType,
  sequelize,
} from '../../../../shared/models';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
  generateOtp,
} from '../../../shared/utils/jwt';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';
import { AppError } from '../../../shared/utils/errors';
import { sendOtpEmail, sendVerificationEmail, sendPasswordResetEmail } from '../../../shared/services/email.service';
import { verifyGoogleIdToken, verifyAppleIdToken } from './socialAuth.service';

function sanitizeUser(user: User) {
  const { passwordHash, ...safe } = user.toJSON();
  return safe;
}

async function createDefaultCategories(userId: string, transaction?: DbTransaction): Promise<void> {
  await Category.bulkCreate(
    DEFAULT_CATEGORIES.map((cat, index) => ({
      userId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      sortOrder: index,
    })),
    { transaction }
  );
}

async function issueTokens(user: User, deviceId?: string, transaction?: DbTransaction) {
  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await RefreshToken.create(
    {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      deviceId: deviceId ?? null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    { transaction }
  );

  await user.update({ lastLoginAt: new Date() }, { transaction });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

async function invalidateTokens(
  email: string,
  type: TokenType,
  transaction?: DbTransaction
): Promise<void> {
  await VerificationToken.update(
    { usedAt: new Date() },
    { where: { email, type, usedAt: null }, transaction }
  );
}

async function storeToken(
  email: string,
  type: TokenType,
  token: string,
  userId: string | null,
  expiresMs: number,
  transaction?: DbTransaction
): Promise<void> {
  await invalidateTokens(email, type, transaction);
  await VerificationToken.create(
    {
      userId,
      email,
      token,
      type,
      expiresAt: new Date(Date.now() + expiresMs),
    },
    { transaction }
  );
}

async function consumeToken(
  token: string,
  type: TokenType,
  transaction?: DbTransaction
): Promise<VerificationToken> {
  const stored = await VerificationToken.findOne({
    where: {
      token,
      type,
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!stored) {
    throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }

  await stored.update({ usedAt: new Date() }, { transaction });
  return stored;
}

export async function register(email: string, password: string, name?: string) {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
  }

  const passwordHash = await hashPassword(password);

  const { tokens, verifyToken } = await sequelize.transaction(async (t) => {
    const user = await User.create(
      {
        email,
        passwordHash,
        name: name ?? null,
        authProvider: 'email',
      },
      { transaction: t }
    );

    await createDefaultCategories(user.id, t);

    const verifyToken = generateAccessToken({ userId: user.id, email, role: user.role });
    await storeToken(email, 'email_verify', verifyToken, user.id, 24 * 60 * 60 * 1000, t);

    const tokens = await issueTokens(user, undefined, t);

    await writeAuditLog({
      action: AuditAction.AUTH_REGISTER,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      afterState: { email: user.email, authProvider: 'email' },
      transaction: t,
    });

    return { tokens, verifyToken };
  });

  await sendVerificationEmail(email, verifyToken);
  return tokens;
}

export async function login(email: string, password: string, deviceId?: string) {
  const user = await User.findOne({ where: { email } });
  if (!user || !user.passwordHash) {
    await writeAuditLog({
      action: AuditAction.AUTH_LOGIN_FAILED,
      resource: AuditResource.AUTH,
      outcome: 'failure',
      severity: 'warning',
      metadata: { email, reason: 'invalid_credentials' },
    });
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    await writeAuditLog({
      action: AuditAction.AUTH_LOGIN_FAILED,
      resource: AuditResource.AUTH,
      actorUserId: user.id,
      outcome: 'failure',
      severity: 'warning',
      metadata: { email, reason: 'invalid_password' },
    });
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (user.isSuspended) {
    throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
  }

  const tokens = await sequelize.transaction(async (t) => {
    const result = await issueTokens(user, deviceId, t);
    await writeAuditLog({
      action: AuditAction.AUTH_LOGIN,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      metadata: { deviceId: deviceId ?? null },
      transaction: t,
    });
    return result;
  });

  return tokens;
}

export async function refresh(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  return sequelize.transaction(async (t) => {
    const stored = await RefreshToken.findOne({
      where: {
        userId: payload.userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!stored) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    await stored.update({ revokedAt: new Date() }, { transaction: t });

    const user = await User.findByPk(payload.userId, { transaction: t });
    if (!user) {
      throw new AppError(401, 'User not found', 'UNAUTHORIZED');
    }

    if (user.isSuspended) {
      throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
    }

    const tokens = await issueTokens(user, stored.deviceId ?? undefined, t);

    await writeAuditLog({
      action: AuditAction.AUTH_REFRESH,
      resource: AuditResource.AUTH,
      actorUserId: user.id,
      transaction: t,
    });

    return tokens;
  });
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const [count] = await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash, revokedAt: null } }
  );

  if (count > 0) {
    await writeAuditLog({
      action: AuditAction.AUTH_LOGOUT,
      resource: AuditResource.AUTH,
    });
  }
}

export async function requestOtp(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    return;
  }

  const otp = generateOtp();
  await sequelize.transaction(async (t) => {
    await storeToken(email, 'otp', otp, user.id, 10 * 60 * 1000, t);
  });
  await sendOtpEmail(email, otp);
}

export async function verifyOtp(email: string, otp: string, deviceId?: string) {
  return sequelize.transaction(async (t) => {
    const stored = await VerificationToken.findOne({
      where: {
        email,
        token: otp,
        type: 'otp',
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!stored) {
      throw new AppError(401, 'Invalid or expired OTP', 'INVALID_OTP');
    }

    await stored.update({ usedAt: new Date() }, { transaction: t });
    const user = await User.findOne({ where: { email }, transaction: t });
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const tokens = await issueTokens(user, deviceId, t);
    await writeAuditLog({
      action: AuditAction.AUTH_LOGIN,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      metadata: { method: 'otp' },
      transaction: t,
    });
    return tokens;
  });
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) return;

  const token = generateAccessToken({ userId: user.id, email, role: user.role });
  await sequelize.transaction(async (t) => {
    await storeToken(email, 'password_reset', token, user.id, 60 * 60 * 1000, t);
    await writeAuditLog({
      action: AuditAction.AUTH_PASSWORD_RESET_REQUEST,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      transaction: t,
    });
  });
  await sendPasswordResetEmail(email, token);
}

export async function resetPassword(token: string, newPassword: string) {
  await sequelize.transaction(async (t) => {
    const stored = await consumeToken(token, 'password_reset', t);
    const user = stored.userId ? await User.findByPk(stored.userId, { transaction: t }) : null;
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    await user.update({ passwordHash: await hashPassword(newPassword) }, { transaction: t });

    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId: user.id, revokedAt: null }, transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.AUTH_PASSWORD_RESET,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      severity: 'warning',
      transaction: t,
    });
  });
}

export async function verifyEmail(token: string) {
  return sequelize.transaction(async (t) => {
    const stored = await consumeToken(token, 'email_verify', t);
    const user = stored.userId ? await User.findByPk(stored.userId, { transaction: t }) : null;
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    await user.update({ emailVerified: true }, { transaction: t });

    await writeAuditLog({
      action: AuditAction.AUTH_EMAIL_VERIFY,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      transaction: t,
    });

    return { message: 'Email verified successfully', user: sanitizeUser(user) };
  });
}

export async function socialLoginWithGoogle(idToken: string, name?: string) {
  const { googleId, email, name: tokenName } = await verifyGoogleIdToken(idToken);
  return socialLogin('google', googleId, email, name ?? tokenName);
}

export async function socialLoginWithApple(idToken: string, name?: string) {
  const { appleId, email } = await verifyAppleIdToken(idToken);
  if (!email) {
    throw new AppError(400, 'Apple account must share email on first sign-in', 'APPLE_EMAIL_REQUIRED');
  }
  return socialLogin('apple', appleId, email, name);
}

export async function socialLogin(
  provider: 'google' | 'apple',
  providerId: string,
  email: string,
  name?: string
) {
  const idField = provider === 'google' ? 'googleId' : 'appleId';

  return sequelize.transaction(async (t) => {
    let user = await User.findOne({ where: { [idField]: providerId }, transaction: t });
    let isNew = false;

    if (!user) {
      user = await User.findOne({ where: { email }, transaction: t });
      if (user) {
        await user.update({ [idField]: providerId, authProvider: provider }, { transaction: t });
      } else {
        user = await User.create(
          {
            email,
            name: name ?? null,
            authProvider: provider,
            [idField]: providerId,
            emailVerified: true,
          },
          { transaction: t }
        );
        await createDefaultCategories(user.id, t);
        isNew = true;
      }
    }

    const tokens = await issueTokens(user, undefined, t);

    await writeAuditLog({
      action: isNew ? AuditAction.AUTH_REGISTER : AuditAction.AUTH_SOCIAL_LOGIN,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      metadata: { provider, isNew },
      transaction: t,
    });

    return tokens;
  });
}

export { sanitizeUser };
