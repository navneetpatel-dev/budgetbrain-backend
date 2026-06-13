import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';
import { Category } from '../models';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await transactionService.listCategories((req as AuthRequest).userId!);
    successResponse(res, categories);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({ name: z.string(), icon: z.string().optional(), color: z.string().optional() })
      .parse(req.body);
    const category = await transactionService.createCategory((req as AuthRequest).userId!, data);
    successResponse(res, category, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        sortOrder: z.number().optional(),
      })
      .parse(req.body);

    const category = await Category.findOne({
      where: { id: req.params.id, userId: (req as AuthRequest).userId! },
    });
    if (!category) throw new AppError(404, 'Category not found');

    await category.update(data);
    successResponse(res, category);
  })
);

router.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const category = await Category.findOne({
      where: { id: req.params.id, userId: (req as AuthRequest).userId! },
    });
    if (!category) throw new AppError(404, 'Category not found');

    await category.update({ isArchived: true });
    successResponse(res, category);
  })
);

router.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const { orderedIds } = z.object({ orderedIds: z.array(z.string().uuid()) }).parse(req.body);
    const userId = (req as AuthRequest).userId!;

    await Promise.all(
      orderedIds.map((id, index) =>
        Category.update({ sortOrder: index }, { where: { id, userId } })
      )
    );

    const categories = await transactionService.listCategories(userId);
    successResponse(res, categories);
  })
);

export default router;
