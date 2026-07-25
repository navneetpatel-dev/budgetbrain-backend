import { z } from 'zod';
import { optionalText, requiredText } from '../../../../validation';

export const createCategorySchema = z.object({
  name: requiredText('categoryName'),
  icon: optionalText('icon'),
  color: optionalText('color'),
});

export const updateCategorySchema = z.object({
  name: optionalText('categoryName'),
  icon: optionalText('icon'),
  color: optionalText('color'),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});
