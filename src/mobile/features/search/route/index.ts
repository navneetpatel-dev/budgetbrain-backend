import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import * as controller from '../controller/search.controller';

const router = Router();

router.get('/', asyncHandler(controller.search));

export default router;
