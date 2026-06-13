import { Op } from 'sequelize';
import {
  User,
  RefreshToken,
  Category,
  DEFAULT_CATEGORIES,
  VerificationToken,
  TokenType,
} from '../models';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyRefreshToken,
  generateOtp,
} from '../utils/jwt';
import { AppError } from '../utils/errors';
import { sendOtpEmail, sendVerificationEmail, sendPasswordResetEmail } from './emailService';

function sanitizeUser(user: User) {
  const { passwordHash, ...safe } = user.toJSON();
  return safe;
}

async function createDefaultCategories(userId: string): Promise<void> {
  await Category.bulkCreate(
    DEFAULT_CATEGORIES.map((cat, index) => ({
      userId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      isDefault: true,
      sortOrder: index,
    }))
  );
}

async function issueTokens(user: User, deviceId?: string) {
  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    deviceId: deviceId ?? null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await user.update({ lastLoginAt: new Date() });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

async function invalidateTokens(email: string, type: TokenType): Promise<void> {
  await VerificationToken.update(
    { usedAt: new Date() },
    { where: { email, type, usedAt: null } }
  );
}

async function storeToken(
  email: string,
  type: TokenType,
  token: string,
  userId: string | null,
  expiresMs: number
): Promise<void> {
  await invalidateTokens(email, type);
  await VerificationToken.create({
    userId,
    email,
    token,
    type,
    expiresAt: new Date(Date.now() + expiresMs),
  });
}

async function consumeToken(token: string, type: TokenType): Promise<VerificationToken> {
  const stored = await VerificationToken.findOne({
    where: {
      token,
      type,
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!stored) {
    throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }

  await stored.update({ usedAt: new Date() });
  return stored;
}

export async function register(email: string, password: string, name?: string) {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    passwordHash,
    name: name ?? null,
    authProvider: 'email',
  });

  await createDefaultCategories(user.id);

  const verifyToken = generateAccessToken({ userId: user.id, email, role: user.role });
  await storeToken(email, 'email_verify', verifyToken, user.id, 24 * 60 * 60 * 1000);
  await sendVerificationEmail(email, verifyToken);

  return issueTokens(user);
}

export async function login(email: string, password: string, deviceId?: string) {
  const user = await User.findOne({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (user.isSuspended) {
    throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
  }

  return issueTokens(user, deviceId);
}

export async function refresh(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const stored = await RefreshToken.findOne({
    where: {
      userId: payload.userId,
      tokenHash,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!stored) {
    throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  await stored.update({ revokedAt: new Date() });

  const user = await User.findByPk(payload.userId);
  if (!user) {
    throw new AppError(401, 'User not found', 'UNAUTHORIZED');
  }

  if (user.isSuspended) {
    throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
  }

  return issueTokens(user, stored.deviceId ?? undefined);
}

export async function logout(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { tokenHash, revokedAt: null } }
  );
}

export async function requestOtp(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Prevent user enumeration — same response whether or not email exists
    return;
  }

  const otp = generateOtp();
  await storeToken(email, 'otp', otp, user.id, 10 * 60 * 1000);
  await sendOtpEmail(email, otp);
}

export async function verifyOtp(email: string, otp: string, deviceId?: string) {
  const stored = await VerificationToken.findOne({
    where: {
      email,
      token: otp,
      type: 'otp',
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!stored) {
    throw new AppError(401, 'Invalid or expired OTP', 'INVALID_OTP');
  }

  await stored.update({ usedAt: new Date() });
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  return issueTokens(user, deviceId);
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) return;

  const token = generateAccessToken({ userId: user.id, email, role: user.role });
  await storeToken(email, 'password_reset', token, user.id, 60 * 60 * 1000);
  await sendPasswordResetEmail(email, token);
}

export async function resetPassword(token: string, newPassword: string) {
  const stored = await consumeToken(token, 'password_reset');
  const user = stored.userId ? await User.findByPk(stored.userId) : null;
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  await user.update({ passwordHash: await hashPassword(newPassword) });

  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId: user.id, revokedAt: null } }
  );
}

export async function verifyEmail(token: string) {
  const stored = await consumeToken(token, 'email_verify');
  const user = stored.userId ? await User.findByPk(stored.userId) : null;
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  await user.update({ emailVerified: true });
  return { message: 'Email verified successfully', user: sanitizeUser(user) };
}

import { verifyGoogleIdToken, verifyAppleIdToken } from './socialAuthService';

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
  let user = await User.findOne({ where: { [idField]: providerId } });

  if (!user) {
    user = await User.findOne({ where: { email } });
    if (user) {
      await user.update({ [idField]: providerId, authProvider: provider });
    } else {
      user = await User.create({
        email,
        name: name ?? null,
        authProvider: provider,
        [idField]: providerId,
        emailVerified: true,
      });
      await createDefaultCategories(user.id);
    }
  }

  return issueTokens(user);
}

export { sanitizeUser };
