import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/categories.controller';
import {
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from '../validator/category.validation';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listCategories));
router.post('/', validateBody(createCategorySchema), asyncHandler(controller.createCategory));
router.post('/reorder', validateBody(reorderCategoriesSchema), asyncHandler(controller.reorderCategories));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateCategorySchema),
  asyncHandler(controller.updateCategory)
);
router.post(
  '/:id/archive',
  validateParams(uuidParamSchema),
  asyncHandler(controller.archiveCategory)
);

export default router;
