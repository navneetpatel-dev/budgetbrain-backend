import { FamilyGroup, FamilyMember } from '../../models';
import { AppError } from '../../utils/errors';
import { generateInviteCode } from '../../utils/jwt';
import { paginatedResult, resolvePagination, type PaginationInput } from '../../shared/pagination';

export async function createGroup(ownerId: string, name: string) {
  const group = await FamilyGroup.create({
    ownerId,
    name,
    inviteCode: generateInviteCode(),
  });

  await FamilyMember.create({
    groupId: group.id,
    userId: ownerId,
    role: 'owner',
  });

  return group;
}

export async function joinGroup(userId: string, inviteCode: string) {
  const group = await FamilyGroup.findOne({ where: { inviteCode } });
  if (!group) throw new AppError(404, 'Invalid invite code');

  const existing = await FamilyMember.findOne({ where: { groupId: group.id, userId } });
  if (existing) throw new AppError(409, 'Already a member');

  return FamilyMember.create({
    groupId: group.id,
    userId,
    role: 'contributor',
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
