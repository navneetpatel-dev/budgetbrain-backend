import {
  Budget,
  Category,
  MerchantCategoryRule,
  RecurringSeries,
  Transaction,
  sequelize,
} from '@database/models';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import { getEntitlementForUser } from '@shared/modules/subscriptions';
import type { PaginationInput } from '@shared/types';
import type { CreateCategoryInput, UpdateCategoryInput } from '../categories.types';

export async function listCategories(
  userId: string,
  filters: PaginationInput & { includeArchived?: boolean } = {}
) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit, 100);
  const where: Record<string, unknown> = { userId };
  if (!filters.includeArchived) {
    where.isArchived = false;
  }
  const { rows, count } = await Category.findAndCountAll({
    where,
    order: [['sortOrder', 'ASC']],
    limit,
    offset,
  });
  return paginatedResult('categories', rows, count, page, limit);
}

export async function createCategory(userId: string, data: CreateCategoryInput) {
  const count = await Category.count({ where: { userId, isArchived: false } });

  const entitlement = await getEntitlementForUser(userId, 'pro');
  if (!entitlement.isEntitled && count >= 14) {
    throw new AppError(
      403,
      'Free tier is limited to 5 custom categories. Upgrade to Pro for unlimited categories.',
      'CATEGORY_LIMIT_REACHED'
    );
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

export async function unarchiveCategory(userId: string, id: string) {
  const category = await Category.findOne({ where: { id, userId } });
  if (!category) throw new AppError(404, 'Category not found');
  await category.update({ isArchived: false });
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

/**
 * Reassigns every reference to `fromCategoryId` (transactions, budgets, recurring series,
 * merchant auto-categorization rules) to `toCategoryId`, then soft-archives the source
 * category (never hard-deleted, so historical reads and audit trails stay intact).
 */
export async function mergeCategories(userId: string, fromCategoryId: string, toCategoryId: string) {
  if (fromCategoryId === toCategoryId) {
    throw new AppError(400, 'Cannot merge a category into itself', 'CATEGORY_MERGE_SAME');
  }

  return sequelize.transaction(async (t) => {
    const fromCategory = await Category.findOne({
      where: { id: fromCategoryId, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!fromCategory) throw new AppError(404, 'Source category not found');

    const toCategory = await Category.findOne({ where: { id: toCategoryId, userId }, transaction: t });
    if (!toCategory) throw new AppError(404, 'Target category not found');

    const [[transactionsMoved], [budgetsMoved], [recurringMoved], [rulesMoved]] = await Promise.all([
      Transaction.update({ categoryId: toCategoryId }, { where: { userId, categoryId: fromCategoryId }, transaction: t }),
      Budget.update({ categoryId: toCategoryId }, { where: { userId, categoryId: fromCategoryId }, transaction: t }),
      RecurringSeries.update({ categoryId: toCategoryId }, { where: { userId, categoryId: fromCategoryId }, transaction: t }),
      MerchantCategoryRule.update({ categoryId: toCategoryId }, { where: { userId, categoryId: fromCategoryId }, transaction: t }),
    ]);

    await fromCategory.update({ isArchived: true }, { transaction: t });

    await writeAuditLog({
      action: AuditAction.CATEGORY_MERGE,
      resource: AuditResource.CATEGORY,
      resourceId: fromCategoryId,
      actorUserId: userId,
      afterState: {
        mergedInto: toCategoryId,
        transactionsMoved,
        budgetsMoved,
        recurringMoved,
        rulesMoved,
      },
      transaction: t,
    });

    return toCategory;
  });
}
