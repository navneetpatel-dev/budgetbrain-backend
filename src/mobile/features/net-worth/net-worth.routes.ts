import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import * as controller from './net-worth.controller';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(controller.getDashboard));

export default router;
