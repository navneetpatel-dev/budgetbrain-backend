import { z } from 'zod';
import { createCategorySchema, updateCategorySchema, reorderCategoriesSchema } from '../validator/category.validation';

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
