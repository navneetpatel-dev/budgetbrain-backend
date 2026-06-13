import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
