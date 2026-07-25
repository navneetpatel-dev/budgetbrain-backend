import { FamilyGroup, FamilyMember, sequelize } from '../../../../models';
import { AppError } from '../../../shared/utils/errors';
import { generateInviteCode } from '../../../shared/utils/jwt';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';
import { paginatedResult, resolvePagination } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';

export async function createGroup(ownerId: string, name: string) {
  return sequelize.transaction(async (t) => {
    const group = await FamilyGroup.create(
      {
        ownerId,
        name,
        inviteCode: generateInviteCode(),
      },
      { transaction: t }
    );

    await FamilyMember.create(
      {
        groupId: group.id,
        userId: ownerId,
        role: 'owner',
      },
      { transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.FAMILY_GROUP_CREATE,
      resource: AuditResource.FAMILY_GROUP,
      resourceId: group.id,
      actorUserId: ownerId,
      afterState: { name: group.name },
      transaction: t,
    });

    return group;
  });
}

export async function joinGroup(userId: string, inviteCode: string) {
  return sequelize.transaction(async (t) => {
    const group = await FamilyGroup.findOne({
      where: { inviteCode },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!group) throw new AppError(404, 'Invalid invite code');

    const existing = await FamilyMember.findOne({
      where: { groupId: group.id, userId },
      transaction: t,
    });
    if (existing) throw new AppError(409, 'Already a member');

    const member = await FamilyMember.create(
      {
        groupId: group.id,
        userId,
        role: 'contributor',
      },
      { transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.FAMILY_GROUP_JOIN,
      resource: AuditResource.FAMILY_MEMBER,
      resourceId: member.id,
      actorUserId: userId,
      afterState: { groupId: group.id, role: 'contributor' },
      transaction: t,
    });

    return member;
  });
}

export async function listUserMemberships(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await FamilyMember.findAndCountAll({
    where: { userId },
    include: [{ model: FamilyGroup, as: 'group' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('memberships', rows, count, page, limit);
}
