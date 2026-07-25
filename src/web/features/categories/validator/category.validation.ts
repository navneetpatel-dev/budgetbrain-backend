import { z } from 'zod';
import {
  optionalText,
  requiredText,
  uuidField,
  ValidationMessages as M,
} from '../../../../shared/validation';

export const createCategorySchema = z.object({
  name: requiredText('categoryName'),
  icon: optionalText('icon'),
  color: optionalText('color'),
});

export const updateCategorySchema = z.object({
  name: optionalText('categoryName'),
  icon: optionalText('icon'),
  color: optionalText('color'),
  sortOrder: z
    .number({ invalid_type_error: M.valueType })
    .int()
    .min(0, M.sortOrderRange)
    .max(10000, M.sortOrderRange)
    .optional(),
});

export const reorderCategoriesSchema = z.object({
  orderedIds: z
    .array(uuidField())
    .min(1, M.reorderMin)
    .max(200, M.reorderMax),
});
