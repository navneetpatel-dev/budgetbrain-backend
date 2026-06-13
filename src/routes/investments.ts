import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Investment } from '../models';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const investments = await Investment.findAll({
      where: { userId: (req as AuthRequest).userId! },
      order: [['createdAt', 'DESC']],
    });

    const enriched = investments.map((inv) => ({
      ...inv.toJSON(),
      currentValue: Number(inv.quantity) * Number(inv.currentPrice),
      gainLoss:
        Number(inv.quantity) * Number(inv.currentPrice) -
        Number(inv.quantity) * Number(inv.purchasePrice),
    }));

    successResponse(res, enriched);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(['stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other']),
        symbol: z.string().optional(),
        quantity: z.number().positive(),
        purchasePrice: z.number().positive(),
        currentPrice: z.number().positive().optional(),
        currency: z.string().length(3).optional(),
        purchaseDate: z.string(),
      })
      .parse(req.body);

    const investment = await Investment.create({
      userId: (req as AuthRequest).userId!,
      currency: 'INR',
      ...data,
      currentPrice: data.currentPrice ?? data.purchasePrice,
      purchaseDate: new Date(data.purchaseDate),
    });
    successResponse(res, investment, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({ currentPrice: z.number().positive(), quantity: z.number().positive().optional() })
      .parse(req.body);

    const investment = await Investment.findOne({
      where: { id: String(req.params.id), userId: (req as AuthRequest).userId! },
    });
    if (!investment) throw new AppError(404, 'Investment not found');

    await investment.update(data);
    successResponse(res, investment);
  })
);

export default router;
