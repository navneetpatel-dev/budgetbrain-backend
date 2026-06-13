import { Op } from 'sequelize';
import {
  User,
  RefreshToken,
  Category,
  DEFAULT_CATEGORIES,
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

const otpStore = new Map<string, { otp: string; expiresAt: Date }>();
const resetStore = new Map<string, { userId: string; expiresAt: Date }>();

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
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const otp = generateOtp();
  otpStore.set(email, { otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  await sendOtpEmail(email, otp);
}

export async function verifyOtp(email: string, otp: string, deviceId?: string) {
  const stored = otpStore.get(email);
  if (!stored || stored.otp !== otp || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Invalid or expired OTP', 'INVALID_OTP');
  }

  otpStore.delete(email);
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
  resetStore.set(token, { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
  await sendPasswordResetEmail(email, token);
}

export async function resetPassword(token: string, newPassword: string) {
  const stored = resetStore.get(token);
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  }

  const user = await User.findByPk(stored.userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  await user.update({ passwordHash: await hashPassword(newPassword) });
  resetStore.delete(token);

  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId: user.id, revokedAt: null } }
  );
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
