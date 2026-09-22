import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createGroup, joinGroup, updateMemberRole } from '../family.service';
import { FamilyGroup, FamilyMember } from '@database/models';

describe('Family ownership self-demotion hole', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('rejects an owner directly demoting themselves without transferring ownership first', async () => {
    const owner = await createTestUser();
    const group = await createGroup(owner.id, 'Test Family');

    await expect(
      updateMemberRole(owner.id, group.id, owner.id, 'admin')
    ).rejects.toThrow('Transfer ownership to another member before changing your own role.');

    const membership = await FamilyMember.findOne({ where: { groupId: group.id, userId: owner.id } });
    expect(membership?.role).toBe('owner');
    const refreshedGroup = await FamilyGroup.findByPk(group.id);
    expect(refreshedGroup?.ownerId).toBe(owner.id);
  });

  it('still allows a genuine ownership transfer to another member', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createGroup(owner.id, 'Test Family 2');
    await joinGroup(member.id, group.inviteCode);

    await updateMemberRole(owner.id, group.id, member.id, 'owner');

    const oldOwnerMembership = await FamilyMember.findOne({ where: { groupId: group.id, userId: owner.id } });
    const newOwnerMembership = await FamilyMember.findOne({ where: { groupId: group.id, userId: member.id } });
    const refreshedGroup = await FamilyGroup.findByPk(group.id);

    expect(oldOwnerMembership?.role).toBe('admin');
    expect(newOwnerMembership?.role).toBe('owner');
    expect(refreshedGroup?.ownerId).toBe(member.id);

    // The new owner can now change the old owner's (now admin) role freely.
    const updated = await updateMemberRole(member.id, group.id, owner.id, 'contributor');
    expect(updated.role).toBe('contributor');
  });
});
