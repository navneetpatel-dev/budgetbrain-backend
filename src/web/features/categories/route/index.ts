import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/categories.controller';
import {
  createCategorySchema,
  mergeCategoriesSchema,
  reorderCategoriesSchema,
  suggestCategorySchema,
  updateCategorySchema,
} from '@shared/modules/categories/validator/category.validation';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listCategories));
router.post('/', validateBody(createCategorySchema), asyncHandler(controller.createCategory));
router.get('/suggest', validateQuery(suggestCategorySchema), asyncHandler(controller.suggestCategory));
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
router.post(
  '/:id/unarchive',
  validateParams(uuidParamSchema),
  asyncHandler(controller.unarchiveCategory)
);
router.post(
  '/:id/merge',
  validateParams(uuidParamSchema),
  validateBody(mergeCategoriesSchema),
  asyncHandler(controller.mergeCategories)
);

export default router;
