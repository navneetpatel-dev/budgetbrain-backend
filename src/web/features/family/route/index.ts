import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/family.controller';
import {
  createGroupSchema,
  createSplitSchema,
  groupIdParamSchema,
  joinGroupSchema,
  removeMemberParamSchema,
  updateMemberRoleSchema,
  createFamilyInviteSchema,
  acceptFamilyInviteSchema,
} from '@shared/modules/family/validator/family.validation';

const router = Router();

// Public — the invite token itself is the credential, no session required. Must be mounted
// before `router.use(authenticate)` below, which gates every other route in this file.
router.post(
  '/invites/accept',
  validateBody(acceptFamilyInviteSchema),
  asyncHandler(controller.acceptInvite)
);

router.use(authenticate);

router.post('/groups', validateBody(createGroupSchema), asyncHandler(controller.createGroup));
router.delete(
  '/groups/:groupId',
  validateParams(groupIdParamSchema),
  asyncHandler(controller.deleteGroup)
);
router.post('/join', validateBody(joinGroupSchema), asyncHandler(controller.joinGroup));
router.get('/groups', validateQuery(paginationSchema), asyncHandler(controller.listMemberships));
router.get(
  '/groups/:groupId/members',
  validateParams(groupIdParamSchema),
  asyncHandler(controller.listGroupMembers)
);
router.delete(
  '/groups/:groupId/members/:userId',
  validateParams(removeMemberParamSchema),
  asyncHandler(controller.removeMember)
);
router.patch(
  '/groups/:groupId/members/:userId',
  validateParams(removeMemberParamSchema),
  validateBody(updateMemberRoleSchema),
  asyncHandler(controller.updateMemberRole)
);
router.post(
  '/groups/:groupId/splits',
  validateParams(groupIdParamSchema),
  validateBody(createSplitSchema),
  asyncHandler(controller.createSplit)
);
router.get(
  '/groups/:groupId/splits',
  validateParams(groupIdParamSchema),
  validateQuery(paginationSchema),
  asyncHandler(controller.listGroupSplits)
);
router.get(
  '/groups/:groupId/balances',
  validateParams(groupIdParamSchema),
  asyncHandler(controller.getGroupBalances)
);
router.post(
  '/splits/:id/settle',
  validateParams(uuidParamSchema),
  asyncHandler(controller.settleSplit)
);
router.post(
  '/groups/:groupId/invites',
  validateParams(groupIdParamSchema),
  validateBody(createFamilyInviteSchema),
  asyncHandler(controller.createInvite)
);

export default router;
