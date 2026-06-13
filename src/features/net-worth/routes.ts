import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { getNetWorthDashboard } from './netWorth.service';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await getNetWorthDashboard((req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

export default router;
