import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '@shared/types';
import * as categoryService from '@shared/modules/categories/service/category.service';
import { suggestCategoryForMerchant } from '@shared/modules/categories/service/merchantMemory.service';
import type {
  CreateCategoryInput,
  MergeCategoriesInput,
  ReorderCategoriesInput,
  SuggestCategoryInput,
  UpdateCategoryInput,
} from '@shared/modules/categories/types';
import type { PaginationInput } from '@shared/types';

export async function listCategories(req: Request, res: Response) {
  const { page, limit, includeArchived } = req.query as PaginationInput & { includeArchived?: string | boolean };
  const data = await categoryService.listCategories((req as AuthRequest).userId!, {
    page,
    limit,
    includeArchived: includeArchived === 'true' || includeArchived === true,
  });
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

export async function unarchiveCategory(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const category = await categoryService.unarchiveCategory((req as AuthRequest).userId!, id);
  successResponse(res, category);
}

export async function suggestCategory(req: Request, res: Response) {
  const { merchant } = req.query as unknown as SuggestCategoryInput;
  const categoryId = await suggestCategoryForMerchant((req as AuthRequest).userId!, merchant);
  successResponse(res, { categoryId });
}

export async function reorderCategories(req: Request, res: Response) {
  const { orderedIds } = req.body as ReorderCategoriesInput;
  const categories = await categoryService.reorderCategories(
    (req as AuthRequest).userId!,
    orderedIds
  );
  successResponse(res, categories);
}

export async function mergeCategories(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { toCategoryId } = req.body as MergeCategoriesInput;
  const category = await categoryService.mergeCategories(
    (req as AuthRequest).userId!,
    id,
    toCategoryId
  );
  successResponse(res, category);
}
