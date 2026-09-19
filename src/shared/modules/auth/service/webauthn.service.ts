import {
  generateRegistrationOptions as simpleGenerateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions as simpleGenerateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { Op } from 'sequelize';
import { User, VerificationToken, WebauthnCredential, sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { env } from '@config/env';
import { issueTokens } from './auth.service';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rpID(): string {
  return new URL(env.APP_URL).hostname;
}

function expectedOrigin(): string {
  return env.APP_URL;
}

async function storeChallenge(email: string, userId: string, challenge: string): Promise<void> {
  await sequelize.transaction(async (t) => {
    await VerificationToken.update(
      { usedAt: new Date() },
      { where: { email, type: 'webauthn_challenge', usedAt: null }, transaction: t }
    );
    await VerificationToken.create(
      {
        userId,
        email,
        token: challenge,
        type: 'webauthn_challenge',
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
      { transaction: t }
    );
  });
}

async function consumeChallenge(email: string): Promise<string> {
  return sequelize.transaction(async (t) => {
    const stored = await VerificationToken.findOne({
      where: {
        email,
        type: 'webauthn_challenge',
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [['createdAt', 'DESC']],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!stored) {
      throw new AppError(401, 'No pending passkey challenge found — please try again', 'WEBAUTHN_CHALLENGE_EXPIRED');
    }
    await stored.update({ usedAt: new Date() }, { transaction: t });
    return stored.token;
  });
}

export async function generateRegistrationOptions(userId: string) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const existingCredentials = await WebauthnCredential.findAll({ where: { userId } });

  const options = await simpleGenerateRegistrationOptions({
    rpName: 'BudgetBrain',
    rpID: rpID(),
    userName: user.email,
    userID: isoUint8Array.fromUTF8String(user.id),
    userDisplayName: user.name ?? user.email,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await storeChallenge(user.email, user.id, options.challenge);
  return options;
}

export async function verifyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  deviceLabel?: string
) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const expectedChallenge = await consumeChallenge(user.email);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpID(),
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError(400, 'Passkey registration could not be verified', 'WEBAUTHN_VERIFICATION_FAILED');
  }

  const { credential } = verification.registrationInfo;

  const existing = await WebauthnCredential.findOne({ where: { credentialId: credential.id } });
  if (existing) {
    throw new AppError(409, 'This passkey is already registered', 'WEBAUTHN_ALREADY_REGISTERED');
  }

  const created = await WebauthnCredential.create({
    userId: user.id,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports ?? null,
    deviceLabel: deviceLabel ?? null,
  });

  await writeAuditLog({
    action: AuditAction.AUTH_LOGIN,
    resource: AuditResource.USER,
    resourceId: user.id,
    actorUserId: user.id,
    metadata: { method: 'webauthn_register', credentialId: created.credentialId },
  });

  return { id: created.id, deviceLabel: created.deviceLabel, createdAt: created.createdAt };
}

export async function generateAuthenticationOptions(email: string) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new AppError(404, 'No account found with this email. Please sign up first.', 'USER_NOT_FOUND');
  }

  const credentials = await WebauthnCredential.findAll({ where: { userId: user.id } });
  if (credentials.length === 0) {
    throw new AppError(404, 'No passkeys registered for this account', 'WEBAUTHN_NO_CREDENTIALS');
  }

  const options = await simpleGenerateAuthenticationOptions({
    rpID: rpID(),
    userVerification: 'preferred',
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
  });

  await storeChallenge(user.email, user.id, options.challenge);
  return options;
}

export async function verifyAuthentication(
  email: string,
  response: AuthenticationResponseJSON,
  deviceId?: string
) {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }
  if (user.isSuspended) {
    throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
  }

  const credentialRow = await WebauthnCredential.findOne({
    where: { credentialId: response.id, userId: user.id },
  });
  if (!credentialRow) {
    throw new AppError(401, 'Passkey not recognized for this account', 'WEBAUTHN_UNKNOWN_CREDENTIAL');
  }

  const expectedChallenge = await consumeChallenge(user.email);

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpID(),
    credential: {
      id: credentialRow.credentialId,
      publicKey: isoBase64URL.toBuffer(credentialRow.publicKey),
      counter: Number(credentialRow.counter),
      transports: (credentialRow.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    },
  });

  if (!verification.verified) {
    throw new AppError(401, 'Passkey authentication failed', 'WEBAUTHN_VERIFICATION_FAILED');
  }

  await credentialRow.update({ counter: verification.authenticationInfo.newCounter });

  return sequelize.transaction(async (t) => {
    const tokens = await issueTokens(user, deviceId, t);
    await writeAuditLog({
      action: AuditAction.AUTH_LOGIN,
      resource: AuditResource.USER,
      resourceId: user.id,
      actorUserId: user.id,
      metadata: { method: 'webauthn' },
      transaction: t,
    });
    return tokens;
  });
}

export async function listCredentials(userId: string) {
  const rows = await WebauthnCredential.findAll({
    where: { userId },
    attributes: ['id', 'deviceLabel', 'createdAt'],
    order: [['createdAt', 'DESC']],
  });
  return rows;
}

export async function removeCredential(userId: string, credentialRowId: string) {
  const deleted = await WebauthnCredential.destroy({ where: { id: credentialRowId, userId } });
  if (!deleted) {
    throw new AppError(404, 'Passkey not found', 'WEBAUTHN_NOT_FOUND');
  }
}

// AuthenticatorTransportFuture isn't exported at the top level in this SDK version — declare the
// minimal shape actually used here rather than pulling in the full type import surface.
type AuthenticatorTransportFuture = 'ble' | 'hybrid' | 'internal' | 'nfc' | 'usb';
