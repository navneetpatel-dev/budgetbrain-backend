import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate, requirePremium } from '../../../../shared/middleware/auth';
import { validateBody, validateQuery } from '../../../../shared/middleware/validate';
import { paginationSchema } from '../../../../shared/validation';
import * as controller from '../controller/family.controller';
import { createGroupSchema, joinGroupSchema } from '../validator/family.validation';

const router = Router();
router.use(authenticate, requirePremium);

router.post('/groups', validateBody(createGroupSchema), asyncHandler(controller.createGroup));
router.post('/join', validateBody(joinGroupSchema), asyncHandler(controller.joinGroup));
router.get('/groups', validateQuery(paginationSchema), asyncHandler(controller.listMemberships));

export default router;
