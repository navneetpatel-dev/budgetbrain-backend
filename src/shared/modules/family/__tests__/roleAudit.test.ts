import { describe, it, expect, beforeAll } from 'vitest';
import { AuditLog } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createGroup, joinGroup, updateMemberRole } from '../family.service';
import { AuditAction } from '@shared/audit';

describe('family role change audit', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('writes FAMILY_ROLE_CHANGE when an owner promotes a member', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createGroup(owner.id, 'Audit Role Family');
    await joinGroup(member.id, group.inviteCode);

    await updateMemberRole(owner.id, group.id, member.id, 'admin');

    const log = await AuditLog.findOne({
      where: { action: AuditAction.FAMILY_ROLE_CHANGE, userId: owner.id },
      order: [['createdAt', 'DESC']],
    });
    expect(log).toBeTruthy();
    expect(log?.afterState).toMatchObject({ targetUserId: member.id, role: 'admin' });
  });
});
