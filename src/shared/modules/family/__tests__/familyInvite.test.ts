import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createGroup, joinGroup, createFamilyInvite, acceptFamilyInvite } from '../service/family.service';
import { FamilyInvite, FamilyMember, User } from '@database/models';

// Real dev DB is persistent/shared across runs, so every invited email must be unique per
// invocation rather than a fixed literal, matching this suite's other tests' convention.
function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@budgetbrain.test`;
}

describe('Family invite tokens (plan item 19)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('requires owner or admin permission to create an invite', async () => {
    const owner = await createTestUser();
    const contributor = await createTestUser();
    const group = await createGroup(owner.id, 'Perm Test Family');
    await joinGroup(contributor.id, group.inviteCode);

    await expect(
      createFamilyInvite(contributor.id, group.id, uniqueEmail('nope'), 'contributor')
    ).rejects.toThrow('Only group owners and admins can invite members');
  });

  it('rejects inviting an email that is already a member', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createGroup(owner.id, 'Dup Test Family');
    await joinGroup(member.id, group.inviteCode);

    await expect(
      createFamilyInvite(owner.id, group.id, member.email, 'contributor')
    ).rejects.toThrow('This email is already a member of the group');
  });

  it('creates a real invite with a hashed token, never storing the raw token', async () => {
    const owner = await createTestUser();
    const group = await createGroup(owner.id, 'Real Invite Family');
    const invitedEmail = uniqueEmail('invitee');

    const result = await createFamilyInvite(owner.id, group.id, invitedEmail, 'admin');
    expect(result.invitedEmail).toBe(invitedEmail);
    expect(result.role).toBe('admin');

    const stored = await FamilyInvite.findByPk(result.id);
    expect(stored).toBeDefined();
    expect(stored!.tokenHash).toHaveLength(64); // sha256 hex digest
    expect(stored!.acceptedAt).toBeNull();
  });

  it('accepting for an existing user just adds membership with the invited role', async () => {
    const owner = await createTestUser();
    const existingInvitee = await createTestUser();
    const group = await createGroup(owner.id, 'Existing User Family');

    // Create the invite, then read the raw token back the same way createFamilyInvite does
    // internally (hash + lookup) since the function itself only emails the raw token.
    const rawTokens: string[] = [];
    const { hashToken } = await import('@shared/utils/jwt');
    const origCreate = FamilyInvite.create.bind(FamilyInvite);
    // Intercept is unnecessary — simplest is to read the DB row's hash and independently
    // regenerate is not possible (one-way hash), so instead directly test acceptFamilyInvite
    // against a token we control end-to-end for this test.
    void origCreate;
    void rawTokens;
    void hashToken;

    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const invite = await FamilyInvite.create({
      groupId: group.id,
      invitedEmail: existingInvitee.email,
      invitedByUserId: owner.id,
      tokenHash: hashToken(rawToken),
      role: 'contributor',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await acceptFamilyInvite(rawToken);
    expect(result.isNewUser).toBe(false);
    expect(result.accessToken).toBeDefined();

    const membership = await FamilyMember.findOne({
      where: { groupId: group.id, userId: existingInvitee.id },
    });
    expect(membership?.role).toBe('contributor');

    const refreshedInvite = await FamilyInvite.findByPk(invite.id);
    expect(refreshedInvite?.acceptedAt).not.toBeNull();
  });

  it('accepting for a brand-new email creates a real account + membership in one flow', async () => {
    const owner = await createTestUser();
    const group = await createGroup(owner.id, 'New User Family');
    const invitedEmail = uniqueEmail('brandnew');

    const { hashToken } = await import('@shared/utils/jwt');
    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    await FamilyInvite.create({
      groupId: group.id,
      invitedEmail,
      invitedByUserId: owner.id,
      tokenHash: hashToken(rawToken),
      role: 'read_only',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await acceptFamilyInvite(rawToken);
    expect(result.isNewUser).toBe(true);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();

    const newUser = await User.findOne({ where: { email: invitedEmail } });
    expect(newUser).toBeDefined();
    expect(newUser!.passwordHash).toBeNull();
    expect(newUser!.emailVerified).toBe(true);

    const membership = await FamilyMember.findOne({ where: { groupId: group.id, userId: newUser!.id } });
    expect(membership?.role).toBe('read_only');
  });

  it('rejects an expired invite token', async () => {
    const owner = await createTestUser();
    const group = await createGroup(owner.id, 'Expired Family');
    const { hashToken } = await import('@shared/utils/jwt');
    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    await FamilyInvite.create({
      groupId: group.id,
      invitedEmail: uniqueEmail('expired'),
      invitedByUserId: owner.id,
      tokenHash: hashToken(rawToken),
      role: 'contributor',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(acceptFamilyInvite(rawToken)).rejects.toThrow('This invite has expired');
  });

  it('rejects an already-accepted invite token from being reused', async () => {
    const owner = await createTestUser();
    const group = await createGroup(owner.id, 'Reuse Family');
    const { hashToken } = await import('@shared/utils/jwt');
    const crypto = await import('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    await FamilyInvite.create({
      groupId: group.id,
      invitedEmail: uniqueEmail('reuse'),
      invitedByUserId: owner.id,
      tokenHash: hashToken(rawToken),
      role: 'contributor',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await acceptFamilyInvite(rawToken);
    await expect(acceptFamilyInvite(rawToken)).rejects.toThrow('This invite has already been used');
  });

  it('rejects a tampered/unknown token', async () => {
    await expect(acceptFamilyInvite('not-a-real-token')).rejects.toThrow('Invalid invite link');
  });
});
