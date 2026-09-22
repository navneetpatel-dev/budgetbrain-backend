import { z } from 'zod';
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  suggestCategorySchema,
  mergeCategoriesSchema,
} from './categories.validator';

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type SuggestCategoryInput = z.infer<typeof suggestCategorySchema>;
export type MergeCategoriesInput = z.infer<typeof mergeCategoriesSchema>;
