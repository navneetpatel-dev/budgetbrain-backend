import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { searchRateLimiter } from '@core/middleware/rateLimit';
import * as controller from './search.controller';

const router = Router();

router.get('/', searchRateLimiter, asyncHandler(controller.search));

export default router;
