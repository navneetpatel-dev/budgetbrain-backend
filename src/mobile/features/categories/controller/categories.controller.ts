import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as categoryService from '../service/category.service';
import type {
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from '../types';
import type { PaginationInput } from '../../../shared/types';

export async function listCategories(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await categoryService.listCategories((req as AuthRequest).userId!, { page, limit });
  successResponse(res, data);
}

export async function createCategory(req: Request, res: Response) {
  const category = await categoryService.createCategory(
    (req as AuthRequest).userId!,
    req.body as CreateCategoryInput
  );
  successResponse(res, category, 201);
}

export async function updateCategory(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const category = await categoryService.updateCategory(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateCategoryInput
  );
  successResponse(res, category);
}

export async function archiveCategory(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const category = await categoryService.archiveCategory((req as AuthRequest).userId!, id);
  successResponse(res, category);
}

export async function reorderCategories(req: Request, res: Response) {
  const { orderedIds } = req.body as ReorderCategoriesInput;
  const categories = await categoryService.reorderCategories(
    (req as AuthRequest).userId!,
    orderedIds
  );
  successResponse(res, categories);
}
