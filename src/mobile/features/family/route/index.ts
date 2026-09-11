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
} from '../validator/family.validation';

const router = Router();
router.use(authenticate);

router.post('/groups', validateBody(createGroupSchema), asyncHandler(controller.createGroup));
router.post('/join', validateBody(joinGroupSchema), asyncHandler(controller.joinGroup));
router.get('/groups', validateQuery(paginationSchema), asyncHandler(controller.listMemberships));
router.get(
  '/groups/:groupId/members',
  validateParams(groupIdParamSchema),
  asyncHandler(controller.listGroupMembers)
);
router.post(
  '/groups/:groupId/splits',
  validateParams(groupIdParamSchema),
  validateBody(createSplitSchema),
  asyncHandler(controller.createSplit)
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

export default router;
