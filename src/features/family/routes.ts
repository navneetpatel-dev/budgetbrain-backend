import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../../middleware/auth';
import * as familyService from './family.service';
import { createGroupSchema, joinGroupSchema } from './family.validation';

const router = Router();
router.use(authenticate);
router.use(requirePremium);

router.post(
  '/groups',
  asyncHandler(async (req, res) => {
    const { name } = createGroupSchema.parse(req.body);
    const group = await familyService.createGroup((req as AuthRequest).userId!, name);
    successResponse(res, group, 201);
  })
);

router.post(
  '/join',
  asyncHandler(async (req, res) => {
    const { inviteCode } = joinGroupSchema.parse(req.body);
    const member = await familyService.joinGroup((req as AuthRequest).userId!, inviteCode);
    successResponse(res, member, 201);
  })
);

router.get(
  '/groups',
  asyncHandler(async (req, res) => {
    const memberships = await familyService.listUserMemberships((req as AuthRequest).userId!);
    successResponse(res, memberships);
  })
);

export default router;
