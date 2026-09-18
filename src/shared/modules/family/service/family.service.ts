import {
  FamilyGroup,
  FamilyMember,
  ExpenseSplitParticipant,
  Transaction,
  User,
  sequelize,
} from '@database/models';
import { AppError } from '@shared/errors';
import { generateInviteCode } from '@shared/utils/jwt';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
import type { CreateSplitInput } from '../types';

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

async function assertMembership(userId: string, groupId: string): Promise<void> {
  const membership = await FamilyMember.findOne({ where: { userId, groupId } });
  if (!membership) throw new AppError(403, 'Not a member of this family group');
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
  await assertMembership(userId, groupId);

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

