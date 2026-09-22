import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import * as controller from './subscriptions.controller';

const router = Router();

router.get('/status', authenticate, asyncHandler(controller.getStatus));

export default router;
