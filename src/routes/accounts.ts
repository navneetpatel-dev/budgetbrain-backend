import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { FinancialAccount } from '../models';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accounts = await FinancialAccount.findAll({
      where: { userId: (req as AuthRequest).userId!, isActive: true },
      order: [['createdAt', 'DESC']],
    });
    successResponse(res, accounts);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(['bank', 'credit_card', 'cash', 'wallet']),
        institution: z.string().optional(),
        accountNumberLast4: z.string().length(4).optional(),
        balance: z.number(),
        creditLimit: z.number().optional(),
        currency: z.string().length(3).optional(),
      })
      .parse(req.body);

    const account = await FinancialAccount.create({
      userId: (req as AuthRequest).userId!,
      currency: 'INR',
      ...data,
    });
    successResponse(res, account, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        balance: z.number().optional(),
        creditLimit: z.number().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    const account = await FinancialAccount.findOne({
      where: { id: String(req.params.id), userId: (req as AuthRequest).userId! },
    });
    if (!account) throw new AppError(404, 'Account not found');

    await account.update(data);
    successResponse(res, account);
  })
);

export default router;
