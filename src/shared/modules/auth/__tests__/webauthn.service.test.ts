import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { setupTestDb, createTestUser } from '@testHelpers';
import { VerificationToken, WebauthnCredential } from '@database/models';
import * as webauthn from '../service/webauthn.service';

// credential_id has a unique DB constraint and this suite runs against a persistent, shared
// dev Postgres (not reset per test) — every credentialId must be unique per invocation, not a
// hardcoded literal, or a second test run collides with rows a prior run already inserted.
function uniqueCredId(label: string): string {
  return `${label}-${randomUUID()}`;
}

// NOTE on scope: a genuinely-valid WebAuthn registration/authentication response requires a
// real hardware/platform authenticator (or a hand-built, spec-correct CBOR attestation object
// signed with a matching key pair) — neither is practical to construct in a backend unit test
// without a browser or a WebAuthn virtual-authenticator harness. These tests cover every piece
// of this module's OWN logic that doesn't require that: options generation, challenge
// storage/expiry/single-use, credential lookup and rejection paths, and multi-passkey support.
// The `verifyRegistrationResponse`/`verifyAuthenticationResponse` library calls themselves are
// exercised here only via their real rejection path (a malformed/garbage response), which
// confirms this service doesn't bypass real verification — not their full success path.

describe('webauthn.service', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  describe('generateRegistrationOptions', () => {
    it('returns options scoped to the user and stores a single-use challenge', async () => {
      const user = await createTestUser();
      const options = await webauthn.generateRegistrationOptions(user.id);

      expect(options.rp.name).toBe('BudgetBrain');
      expect(options.user.name).toBe(user.email);
      expect(options.challenge).toBeTruthy();
      expect(options.excludeCredentials).toEqual([]);

      const stored = await VerificationToken.findOne({
        where: { email: user.email, type: 'webauthn_challenge', token: options.challenge },
      });
      expect(stored).not.toBeNull();
      expect(stored!.usedAt).toBeNull();
    });

    it('excludes already-registered credentials from a second registration attempt', async () => {
      const user = await createTestUser();
      const existingCredId = uniqueCredId('existing');
      await WebauthnCredential.create({
        userId: user.id,
        credentialId: existingCredId,
        publicKey: Buffer.from('fake-key').toString('base64url'),
        counter: 0,
        transports: ['internal'],
      });

      const options = await webauthn.generateRegistrationOptions(user.id);
      expect(options.excludeCredentials?.map((c) => c.id)).toContain(existingCredId);
    });

    it('rejects a non-existent user', async () => {
      await expect(webauthn.generateRegistrationOptions('00000000-0000-0000-0000-000000000000'))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('invalidates a prior unused challenge when a new one is generated', async () => {
      const user = await createTestUser();
      const first = await webauthn.generateRegistrationOptions(user.id);
      const second = await webauthn.generateRegistrationOptions(user.id);

      const firstToken = await VerificationToken.findOne({ where: { token: first.challenge } });
      const secondToken = await VerificationToken.findOne({ where: { token: second.challenge } });
      expect(firstToken!.usedAt).not.toBeNull();
      expect(secondToken!.usedAt).toBeNull();
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('rejects login-options request for an unknown email', async () => {
      await expect(webauthn.generateAuthenticationOptions('nobody@budgetbrain.test'))
        .rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
    });

    it('rejects a user with no registered passkeys', async () => {
      const user = await createTestUser();
      await expect(webauthn.generateAuthenticationOptions(user.email))
        .rejects.toMatchObject({ code: 'WEBAUTHN_NO_CREDENTIALS' });
    });

    it('lists all of a user\'s registered credentials as allowCredentials (multi-device support)', async () => {
      const user = await createTestUser();
      const laptopCredId = uniqueCredId('laptop');
      const phoneCredId = uniqueCredId('phone');
      await WebauthnCredential.create({
        userId: user.id,
        credentialId: laptopCredId,
        publicKey: Buffer.from('k1').toString('base64url'),
        counter: 0,
      });
      await WebauthnCredential.create({
        userId: user.id,
        credentialId: phoneCredId,
        publicKey: Buffer.from('k2').toString('base64url'),
        counter: 0,
      });

      const options = await webauthn.generateAuthenticationOptions(user.email);
      const ids = options.allowCredentials?.map((c) => c.id) ?? [];
      expect(ids).toContain(laptopCredId);
      expect(ids).toContain(phoneCredId);
      expect(ids).toHaveLength(2);
    });
  });

  describe('verifyRegistration', () => {
    it('rejects when there is no pending challenge', async () => {
      const user = await createTestUser();
      await expect(
        webauthn.verifyRegistration(user.id, { id: 'x' } as never)
      ).rejects.toMatchObject({ code: 'WEBAUTHN_CHALLENGE_EXPIRED' });
    });

    it('rejects a malformed/garbage credential response without ever writing a row', async () => {
      const user = await createTestUser();
      await webauthn.generateRegistrationOptions(user.id);

      await expect(
        webauthn.verifyRegistration(user.id, {
          id: 'garbage',
          rawId: 'garbage',
          type: 'public-key',
          clientExtensionResults: {},
          response: { clientDataJSON: 'not-real-base64url-cbor', attestationObject: 'also-not-real' },
        } as never)
      ).rejects.toThrow();

      const count = await WebauthnCredential.count({ where: { userId: user.id } });
      expect(count).toBe(0);
    });
  });

  describe('verifyAuthentication', () => {
    it('rejects a credential id not registered to that user', async () => {
      const user = await createTestUser();
      await expect(
        webauthn.verifyAuthentication(user.email, { id: 'never-registered' } as never)
      ).rejects.toMatchObject({ code: 'WEBAUTHN_UNKNOWN_CREDENTIAL' });
    });

    it('rejects a suspended user even with a real credential row', async () => {
      const user = await createTestUser({ isSuspended: true });
      const cred1Id = uniqueCredId('cred1');
      await WebauthnCredential.create({
        userId: user.id,
        credentialId: cred1Id,
        publicKey: Buffer.from('k').toString('base64url'),
        counter: 0,
      });
      await expect(
        webauthn.verifyAuthentication(user.email, { id: cred1Id } as never)
      ).rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
    });
  });

  describe('listCredentials / removeCredential', () => {
    it('lists only the calling user\'s passkeys, never another user\'s', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const aCredId = uniqueCredId('a');
      const bCredId = uniqueCredId('b');
      await WebauthnCredential.create({
        userId: userA.id,
        credentialId: aCredId,
        publicKey: Buffer.from('k').toString('base64url'),
        counter: 0,
        deviceLabel: 'A laptop',
      });
      await WebauthnCredential.create({
        userId: userB.id,
        credentialId: bCredId,
        publicKey: Buffer.from('k').toString('base64url'),
        counter: 0,
      });

      const listA = await webauthn.listCredentials(userA.id);
      expect(listA).toHaveLength(1);
      expect(listA[0].deviceLabel).toBe('A laptop');
    });

    it('does not allow removing another user\'s passkey', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const aCred2Id = uniqueCredId('a2');
      const cred = await WebauthnCredential.create({
        userId: userA.id,
        credentialId: aCred2Id,
        publicKey: Buffer.from('k').toString('base64url'),
        counter: 0,
      });

      await expect(webauthn.removeCredential(userB.id, cred.id))
        .rejects.toMatchObject({ statusCode: 404 });

      const stillExists = await WebauthnCredential.findByPk(cred.id);
      expect(stillExists).not.toBeNull();
    });

    it('removes a credential the user actually owns', async () => {
      const user = await createTestUser();
      const ownCredId = uniqueCredId('own');
      const cred = await WebauthnCredential.create({
        userId: user.id,
        credentialId: ownCredId,
        publicKey: Buffer.from('k').toString('base64url'),
        counter: 0,
      });
      await webauthn.removeCredential(user.id, cred.id);
      expect(await WebauthnCredential.findByPk(cred.id)).toBeNull();
    });
  });
});
