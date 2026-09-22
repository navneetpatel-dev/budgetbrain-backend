import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import * as controller from './search.controller';

const router = Router();

router.get('/', asyncHandler(controller.search));

export default router;
