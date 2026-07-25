import { Category, User } from '../../../../models';
import { AppError } from '../../../shared/utils/errors';
import { paginatedResult, resolvePagination } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';
import type { CreateCategoryInput, UpdateCategoryInput } from '../types';

const FREE_CATEGORY_LIMIT = 20;

export async function listCategories(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit, 100);
  const { rows, count } = await Category.findAndCountAll({
    where: { userId, isArchived: false },
    order: [['sortOrder', 'ASC']],
    limit,
    offset,
  });
  return paginatedResult('categories', rows, count, page, limit);
}

export async function createCategory(userId: string, data: CreateCategoryInput) {
  const count = await Category.count({ where: { userId, isArchived: false } });
  const user = await User.findByPk(userId);
  if (user?.role === 'free' && count >= FREE_CATEGORY_LIMIT) {
    throw new AppError(403, 'Category limit reached for free plan', 'LIMIT_REACHED');
  }

  return Category.create({
    userId,
    name: data.name,
    icon: data.icon ?? null,
    color: data.color ?? null,
    sortOrder: count,
  });
}

export async function updateCategory(userId: string, id: string, data: UpdateCategoryInput) {
  const category = await Category.findOne({ where: { id, userId } });
  if (!category) throw new AppError(404, 'Category not found');
  await category.update(data);
  return category;
}

export async function archiveCategory(userId: string, id: string) {
  const category = await Category.findOne({ where: { id, userId } });
  if (!category) throw new AppError(404, 'Category not found');
  await category.update({ isArchived: true });
  return category;
}

export async function reorderCategories(userId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, index) =>
      Category.update({ sortOrder: index }, { where: { id, userId } })
    )
  );
  return listCategories(userId, { page: 1, limit: 100 });
}
