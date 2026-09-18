import type { Transaction as DbTransaction } from 'sequelize';
import { MerchantCategoryRule } from '@database/models';

function normalizeMerchant(merchant: string): string {
  return merchant.trim().toLowerCase();
}

/** Remember which category a user picks for a merchant, so future entries can be pre-filled. */
export async function upsertMerchantCategoryRule(
  userId: string,
  merchant: string,
  categoryId: string,
  dbTx?: DbTransaction
): Promise<void> {
  const normalized = normalizeMerchant(merchant);
  if (!normalized) return;

  const txOpts = dbTx ? { transaction: dbTx } : undefined;
  const existing = await MerchantCategoryRule.findOne({
    where: { userId, merchant: normalized },
    ...txOpts,
  });

  if (existing) {
    if (existing.categoryId !== categoryId) {
      await existing.update({ categoryId }, txOpts);
    }
  } else {
    await MerchantCategoryRule.create({ userId, merchant: normalized, categoryId }, txOpts);
  }
}

/** Look up the category a user has previously used for this merchant, if any. */
export async function suggestCategoryForMerchant(
  userId: string,
  merchant: string
): Promise<string | null> {
  const normalized = normalizeMerchant(merchant);
  if (!normalized) return null;

  const rule = await MerchantCategoryRule.findOne({ where: { userId, merchant: normalized } });
  return rule?.categoryId ?? null;
}
