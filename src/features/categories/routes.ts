import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as categoryService from './category.service';
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
} from './category.validation';
import { paginationSchema, uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await categoryService.listCategories((req as AuthRequest).userId!, { page, limit });
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory((req as AuthRequest).userId!, data);
    successResponse(res, category, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = updateCategorySchema.parse(req.body);
    const category = await categoryService.updateCategory((req as AuthRequest).userId!, id, data);
    successResponse(res, category);
  })
);

router.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const category = await categoryService.archiveCategory((req as AuthRequest).userId!, id);
    successResponse(res, category);
  })
);

router.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const { orderedIds } = reorderCategoriesSchema.parse(req.body);
    const categories = await categoryService.reorderCategories(
      (req as AuthRequest).userId!,
      orderedIds
    );
    successResponse(res, categories);
  })
);

export default router;
