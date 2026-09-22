import { randomBytes } from 'crypto';
import {
  FamilyGroup,
  FamilyMember,
  FamilyInvite,
  ExpenseSplitParticipant,
  Transaction,
  User,
  sequelize,
} from '@database/models';
import type { FamilyInviteRole } from '@database/models/familyInvite.model';
import { AppError } from '@shared/errors';
import { generateInviteCode, hashToken } from '@core/auth/jwt';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import { createDefaultCategories, issueTokens } from '@shared/modules/auth/service/auth.service';
import { emailQueue } from '@queue/queues';
import type { PaginationInput } from '@shared/types';
import type { CreateSplitInput } from './family.types';

const FAMILY_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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

async function assertMembership(userId: string, groupId: string) {
  const membership = await FamilyMember.findOne({ where: { userId, groupId } });
  if (!membership) throw new AppError(403, 'Not a member of this family group');
  return membership;
}

export async function listGroupMembers(userId: string, groupId: string) {
  await assertMembership(userId, groupId);
  return FamilyMember.findAll({
    where: { groupId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatarUrl'] }],
    order: [['createdAt', 'ASC']],
  });
}

export async function createSplit(userId: string, groupId: string, data: CreateSplitInput) {
  const membership = await assertMembership(userId, groupId);
  if (membership.role === 'read_only') {
    throw new AppError(403, 'Read-only members cannot create expense splits');
  }

  const transaction = await Transaction.findOne({ where: { id: data.transactionId, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');

  const memberIds = new Set(
    (await FamilyMember.findAll({ where: { groupId }, attributes: ['userId'] })).map((m) => m.userId)
  );
  for (const participant of data.participants) {
    if (!memberIds.has(participant.userId)) {
      throw new AppError(400, 'All participants must belong to the family group');
    }
  }

  const seenParticipantIds = new Set<string>();
  for (const participant of data.participants) {
    if (seenParticipantIds.has(participant.userId)) {
      throw new AppError(400, 'Duplicate participant in split', 'DUPLICATE_SPLIT_PARTICIPANT');
    }
    seenParticipantIds.add(participant.userId);
  }

  const totalShares = data.participants.reduce((sum, p) => sum + p.shareAmount, 0);
  if (totalShares > Number(transaction.amount)) {
    throw new AppError(400, 'Split amounts cannot exceed the transaction amount');
  }

  return sequelize.transaction(async (t) => {
    await ExpenseSplitParticipant.destroy({ where: { transactionId: transaction.id }, transaction: t });

    const rows = await ExpenseSplitParticipant.bulkCreate(
      data.participants.map((p) => ({
        transactionId: transaction.id,
        groupId,
        userId: p.userId,
        shareAmount: p.shareAmount,
      })),
      { transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.FAMILY_SPLIT_CREATE,
      resource: AuditResource.FAMILY_SPLIT,
      resourceId: transaction.id,
      actorUserId: userId,
      afterState: { groupId, transactionId: transaction.id, participants: data.participants },
      transaction: t,
    });

    return rows;
  });
}

/** Individual unsettled splits for a group, so a client can settle one at a time. */
export async function listGroupSplits(userId: string, groupId: string, filters: PaginationInput = {}) {
  await assertMembership(userId, groupId);

  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await ExpenseSplitParticipant.findAndCountAll({
    where: { groupId, settled: false },
    include: [
      { model: Transaction, as: 'transaction', attributes: ['id', 'userId', 'merchant', 'amount', 'date'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('splits', rows, count, page, limit);
}

export async function getGroupBalances(userId: string, groupId: string) {
  await assertMembership(userId, groupId);

  const participants = await ExpenseSplitParticipant.findAll({
    where: { groupId, settled: false },
    include: [{ model: Transaction, as: 'transaction', attributes: ['id', 'userId', 'merchant'] }],
  });

  const balances = new Map<string, { fromUserId: string; toUserId: string; amount: number }>();
  for (const p of participants) {
    const payerId = (p as unknown as { transaction: { userId: string } }).transaction.userId;
    if (p.userId === payerId) continue;
    const key = `${p.userId}->${payerId}`;
    const existing = balances.get(key);
    if (existing) {
      existing.amount += Number(p.shareAmount);
    } else {
      balances.set(key, { fromUserId: p.userId, toUserId: payerId, amount: Number(p.shareAmount) });
    }
  }

  return Array.from(balances.values());
}

export async function settleSplit(userId: string, splitParticipantId: string) {
  return sequelize.transaction(async (t) => {
    const participant = await ExpenseSplitParticipant.findOne({
      where: { id: splitParticipantId },
      include: [{ model: Transaction, as: 'transaction', attributes: ['id', 'userId'] }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!participant) throw new AppError(404, 'Split not found');

    const payerId = (participant as unknown as { transaction: { userId: string } }).transaction.userId;
    if (userId !== participant.userId && userId !== payerId) {
      throw new AppError(403, 'Not authorized to settle this split');
    }

    const membership = await FamilyMember.findOne({
      where: { groupId: participant.groupId, userId },
      transaction: t,
    });
    if (!membership || membership.role === 'read_only') {
      throw new AppError(403, 'Read-only members cannot settle expense splits');
    }

    if (participant.settled) {
      throw new AppError(409, 'Split is already settled');
    }

    await participant.update({ settled: true, settledAt: new Date() }, { transaction: t });

    await writeAuditLog({
      action: AuditAction.FAMILY_SPLIT_SETTLE,
      resource: AuditResource.FAMILY_SPLIT,
      resourceId: splitParticipantId,
      actorUserId: userId,
      afterState: { settled: true },
      transaction: t,
    });

    return participant;
  });
}

export async function removeMember(actorId: string, groupId: string, targetUserId: string) {
  return sequelize.transaction(async (t) => {
    const group = await FamilyGroup.findByPk(groupId, { transaction: t });
    if (!group) throw new AppError(404, 'Family group not found');

    const actorMembership = await FamilyMember.findOne({
      where: { groupId, userId: actorId },
      transaction: t,
    });
    if (!actorMembership) throw new AppError(403, 'Not a member of this family group');

    const targetMembership = await FamilyMember.findOne({
      where: { groupId, userId: targetUserId },
      transaction: t,
    });
    if (!targetMembership) throw new AppError(404, 'Member not found in this group');

    const isSelf = actorId === targetUserId;
    if (!isSelf) {
      if (actorMembership.role !== 'owner' && actorMembership.role !== 'admin') {
        throw new AppError(403, 'Only group owners and admins can remove members');
      }
      if (actorMembership.role === 'admin' && (targetMembership.role === 'owner' || targetMembership.role === 'admin')) {
        throw new AppError(403, 'Admins cannot remove group owners or other admins');
      }
    } else {
      if (actorMembership.role === 'owner') {
        const memberCount = await FamilyMember.count({ where: { groupId }, transaction: t });
        if (memberCount > 1) {
          throw new AppError(400, 'Owners cannot leave a group with active members. Transfer ownership or delete the group.');
        }
      }
    }

    await targetMembership.destroy({ transaction: t });

    await writeAuditLog({
      action: AuditAction.FAMILY_MEMBER_REMOVE,
      resource: AuditResource.FAMILY_MEMBER,
      resourceId: targetMembership.id,
      actorUserId: actorId,
      beforeState: { groupId, userId: targetUserId, role: targetMembership.role },
      transaction: t,
    });

    return { removed: true, userId: targetUserId };
  });
}

export async function deleteGroup(actorId: string, groupId: string) {
  return sequelize.transaction(async (t) => {
    const group = await FamilyGroup.findByPk(groupId, { transaction: t });
    if (!group) throw new AppError(404, 'Family group not found');

    const actorMembership = await FamilyMember.findOne({
      where: { groupId, userId: actorId },
      transaction: t,
    });
    if (!actorMembership || actorMembership.role !== 'owner') {
      throw new AppError(403, 'Only the group owner can delete the family group');
    }

    await ExpenseSplitParticipant.destroy({ where: { groupId }, transaction: t });
    await FamilyMember.destroy({ where: { groupId }, transaction: t });
    await group.destroy({ transaction: t });

    await writeAuditLog({
      action: AuditAction.FAMILY_GROUP_DELETE,
      resource: AuditResource.FAMILY_GROUP,
      resourceId: groupId,
      actorUserId: actorId,
      beforeState: { name: group.name, ownerId: group.ownerId },
      transaction: t,
    });

    return { deleted: true, groupId };
  });
}

/** Owner or admin may invite; matches the same permission tier removeMember() already enforces. */
async function assertCanInvite(userId: string, groupId: string) {
  const membership = await FamilyMember.findOne({ where: { userId, groupId } });
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    throw new AppError(403, 'Only group owners and admins can invite members');
  }
}

export async function createFamilyInvite(
  inviterId: string,
  groupId: string,
  invitedEmail: string,
  role: FamilyInviteRole
) {
  await assertCanInvite(inviterId, groupId);

  const group = await FamilyGroup.findByPk(groupId);
  if (!group) throw new AppError(404, 'Family group not found');

  const existingMember = await FamilyMember.findOne({
    where: { groupId },
    include: [{ model: User, as: 'user', where: { email: invitedEmail }, attributes: [] }],
  });
  if (existingMember) throw new AppError(409, 'This email is already a member of the group');

  const inviter = await User.findByPk(inviterId);

  const rawToken = randomBytes(32).toString('hex');
  const invite = await FamilyInvite.create({
    groupId,
    invitedEmail,
    invitedByUserId: inviterId,
    tokenHash: hashToken(rawToken),
    role,
    expiresAt: new Date(Date.now() + FAMILY_INVITE_EXPIRY_MS),
  });

  await emailQueue.add('family_invite', {
    to: invitedEmail,
    kind: 'family_invite',
    payload: { token: rawToken, groupName: group.name, inviterName: inviter?.name ?? 'A family member' },
  });

  await writeAuditLog({
    action: AuditAction.FAMILY_INVITE_CREATE,
    resource: AuditResource.FAMILY_INVITE,
    resourceId: invite.id,
    actorUserId: inviterId,
    afterState: { groupId, invitedEmail, role },
  });

  return { id: invite.id, invitedEmail, role, expiresAt: invite.expiresAt };
}

export async function acceptFamilyInvite(token: string) {
  const tokenHash = hashToken(token);

  return sequelize.transaction(async (t) => {
    const invite = await FamilyInvite.findOne({ where: { tokenHash }, transaction: t, lock: t.LOCK.UPDATE });
    if (!invite) throw new AppError(404, 'Invalid invite link', 'INVALID_INVITE');
    if (invite.acceptedAt) throw new AppError(409, 'This invite has already been used', 'INVITE_ALREADY_USED');
    if (invite.expiresAt < new Date()) throw new AppError(410, 'This invite has expired', 'INVITE_EXPIRED');

    let user = await User.findOne({ where: { email: invite.invitedEmail }, transaction: t });
    let isNewUser = false;

    if (!user) {
      // No password set on creation — accepting the invite proves email ownership (same trust
      // level as social login), so the account is created passwordless and the user can set one
      // later via the existing forgot-password flow, mirroring how socialLogin() already
      // creates passwordless accounts rather than inventing new account-state machinery.
      user = await User.create(
        {
          email: invite.invitedEmail,
          name: null,
          authProvider: 'email',
          emailVerified: true,
        },
        { transaction: t }
      );
      await createDefaultCategories(user.id, t);
      isNewUser = true;
    }

    const existingMembership = await FamilyMember.findOne({
      where: { groupId: invite.groupId, userId: user.id },
      transaction: t,
    });
    if (existingMembership) throw new AppError(409, 'Already a member of this group');

    const member = await FamilyMember.create(
      { groupId: invite.groupId, userId: user.id, role: invite.role },
      { transaction: t }
    );

    await invite.update({ acceptedAt: new Date() }, { transaction: t });

    const tokens = await issueTokens(user, undefined, t);

    await writeAuditLog({
      action: AuditAction.FAMILY_INVITE_ACCEPT,
      resource: AuditResource.FAMILY_INVITE,
      resourceId: invite.id,
      actorUserId: user.id,
      afterState: { groupId: invite.groupId, role: invite.role, isNewUser },
      transaction: t,
    });

    return { ...tokens, membership: member, isNewUser };
  });
}

export async function updateMemberRole(
  actorId: string,
  groupId: string,
  targetUserId: string,
  newRole: 'owner' | 'admin' | 'contributor' | 'read_only'
) {
  return sequelize.transaction(async (t) => {
    const actorMembership = await FamilyMember.findOne({ where: { groupId, userId: actorId }, transaction: t });
    if (!actorMembership || actorMembership.role !== 'owner') {
      throw new AppError(403, 'Only the group owner can change member roles');
    }

    const targetMembership = await FamilyMember.findOne({ where: { groupId, userId: targetUserId }, transaction: t });
    if (!targetMembership) throw new AppError(404, 'Member not found');

    if (targetMembership.role === 'owner' && newRole !== 'owner') {
      throw new AppError(
        400,
        'Transfer ownership to another member before changing your own role.'
      );
    }

    const previousRole = targetMembership.role;

    if (newRole === 'owner') {
      await actorMembership.update({ role: 'admin' }, { transaction: t });
      await FamilyGroup.update({ ownerId: targetUserId }, { where: { id: groupId }, transaction: t });
    }

    await targetMembership.update({ role: newRole }, { transaction: t });

    await writeAuditLog({
      action: newRole === 'owner' ? AuditAction.FAMILY_OWNERSHIP_TRANSFER : AuditAction.FAMILY_ROLE_CHANGE,
      resource: AuditResource.FAMILY_MEMBER,
      resourceId: targetMembership.id,
      actorUserId: actorId,
      beforeState: { targetUserId, role: previousRole, ownerId: newRole === 'owner' ? actorId : undefined },
      afterState: {
        targetUserId,
        role: newRole,
        ownerId: newRole === 'owner' ? targetUserId : undefined,
      },
      transaction: t,
    });

    return targetMembership;
  });
}

