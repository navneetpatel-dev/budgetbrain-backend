import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../middleware/auth';
import { FamilyGroup, FamilyMember } from '../models';
import { generateInviteCode } from '../utils/jwt';

const router = Router();
router.use(authenticate);
router.use(requirePremium);

router.post(
  '/groups',
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string() }).parse(req.body);
    const userId = (req as AuthRequest).userId!;

    const group = await FamilyGroup.create({
      ownerId: userId,
      name,
      inviteCode: generateInviteCode(),
    });

    await FamilyMember.create({
      groupId: group.id,
      userId,
      role: 'owner',
    });

    successResponse(res, group, 201);
  })
);

router.post(
  '/join',
  asyncHandler(async (req, res) => {
    const { inviteCode } = z.object({ inviteCode: z.string() }).parse(req.body);
    const userId = (req as AuthRequest).userId!;

    const group = await FamilyGroup.findOne({ where: { inviteCode } });
    if (!group) throw new AppError(404, 'Invalid invite code');

    const existing = await FamilyMember.findOne({ where: { groupId: group.id, userId } });
    if (existing) throw new AppError(409, 'Already a member');

    const member = await FamilyMember.create({
      groupId: group.id,
      userId,
      role: 'contributor',
    });

    successResponse(res, member, 201);
  })
);

router.get(
  '/groups',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const memberships = await FamilyMember.findAll({
      where: { userId },
      include: [{ model: FamilyGroup, as: 'group' }],
    });
    successResponse(res, memberships);
  })
);

export default router;
