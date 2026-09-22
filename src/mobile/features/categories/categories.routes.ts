import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './categories.controller';
import {
  createCategorySchema,
  mergeCategoriesSchema,
  reorderCategoriesSchema,
  suggestCategorySchema,
  updateCategorySchema,
} from '@shared/modules/categories/categories.validator';

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
