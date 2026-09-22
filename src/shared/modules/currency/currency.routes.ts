import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import * as controller from './currency.controller';

const router = Router();

router.get('/rates', asyncHandler(controller.getRates));
router.post('/convert', asyncHandler(controller.convert));

export default router;
