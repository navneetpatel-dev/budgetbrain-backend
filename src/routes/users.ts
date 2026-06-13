import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sanitizeUser } from '../services/authService';
import * as transactionService from '../services/transactionService';
import { deleteUserAccount } from '../services/userService';
import { User } from '../models';

const router = Router();

router.use(authenticate);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await User.findByPk((req as AuthRequest).userId!);
    if (!user) throw new AppError(404, 'User not found');
    successResponse(res, sanitizeUser(user));
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        country: z.string().optional(),
        currency: z.string().length(3).optional(),
        avatarUrl: z.string().url().optional(),
      })
      .parse(req.body);

    const user = await User.findByPk((req as AuthRequest).userId!);
    if (!user) throw new AppError(404, 'User not found');

    await user.update(data);
    successResponse(res, sanitizeUser(user));
  })
);

router.post(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        country: z.string(),
        currency: z.string().length(3),
        financialGoals: z.array(z.string()),
        salaryRange: z.string(),
        monthlySavingsTarget: z.number().positive(),
      })
      .parse(req.body);

    const user = await transactionService.updateOnboarding((req as AuthRequest).userId!, data);
    successResponse(res, sanitizeUser(user));
  })
);

router.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    await deleteUserAccount(userId);
    successResponse(res, { message: 'Account deleted successfully' });
  })
);

export default router;
