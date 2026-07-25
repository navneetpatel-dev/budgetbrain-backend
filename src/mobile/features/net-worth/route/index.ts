import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import * as controller from '../controller/net-worth.controller';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(controller.getDashboard));

export default router;
