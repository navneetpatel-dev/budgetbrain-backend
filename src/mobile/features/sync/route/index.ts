import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody } from '../../../shared/middleware/validate';
import * as controller from '../controller/sync.controller';
import { syncBatchSchema } from '../validator/sync.validation';

const router = Router();
router.use(authenticate);

router.post('/batch', validateBody(syncBatchSchema), asyncHandler(controller.processBatch));

export default router;
