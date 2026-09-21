import { AiUsageQuota, sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import { env } from '@config/env';
import { getEntitlementForUser } from '@shared/modules/subscriptions';

/** Conservative pre-reservation so concurrent requests cannot all pass a stale read. */
export const AI_CHAT_ESTIMATED_TOKENS = 1500;

function currentPeriodMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

async function resolveMonthlyLimit(userId: string): Promise<number> {
  const entitlement = await getEntitlementForUser(userId, 'pro');
  return entitlement.isEntitled ? env.AI_PRO_MONTHLY_TOKEN_LIMIT : env.AI_FREE_MONTHLY_TOKEN_LIMIT;
}

/**
 * Atomically reserve tokens against this month's quota *before* the OpenAI call.
 * Concurrent callers serialize on a row lock so they cannot all observe a stale tokensUsed.
 */
export async function reserveAiQuota(
  userId: string,
  tokens: number = AI_CHAT_ESTIMATED_TOKENS
): Promise<{ limit: number; reserved: number }> {
  const estimated = Math.max(0, Math.floor(tokens));
  const periodMonth = currentPeriodMonth();
  const limit = await resolveMonthlyLimit(userId);

  return sequelize.transaction(async (t) => {
    await AiUsageQuota.findOrCreate({
      where: { userId, periodMonth },
      defaults: { userId, periodMonth, tokensUsed: 0 },
      transaction: t,
    });

    const row = await AiUsageQuota.findOne({
      where: { userId, periodMonth },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!row) {
      throw new AppError(429, 'Monthly AI quota exceeded', 'AI_QUOTA_EXCEEDED');
    }

    const remaining = limit - row.tokensUsed;
    if (remaining <= 0) {
      throw new AppError(429, 'Monthly AI quota exceeded', 'AI_QUOTA_EXCEEDED');
    }

    const reserved = Math.min(estimated, remaining);
    if (reserved > 0) {
      await row.increment('tokensUsed', { by: reserved, transaction: t });
    }
    return { limit, reserved };
  });
}

/** Apply a signed delta (can be negative) without a quota gate — used to true-up or release a reservation. */
export async function adjustAiQuota(userId: string, delta: number): Promise<void> {
  const amount = Math.trunc(delta);
  if (!amount) return;
  const periodMonth = currentPeriodMonth();

  await sequelize.transaction(async (t) => {
    const [row] = await AiUsageQuota.findOrCreate({
      where: { userId, periodMonth },
      defaults: { userId, periodMonth, tokensUsed: 0 },
      transaction: t,
    });
    if (amount > 0) {
      await row.increment('tokensUsed', { by: amount, transaction: t });
      return;
    }
    const next = Math.max(0, row.tokensUsed + amount);
    await row.update({ tokensUsed: next }, { transaction: t });
  });
}

/** @deprecated Prefer reserveAiQuota before the OpenAI call. Kept for read-only remaining checks. */
export async function checkAiQuota(userId: string): Promise<{ limit: number; used: number }> {
  const periodMonth = currentPeriodMonth();
  const limit = await resolveMonthlyLimit(userId);
  const [row] = await AiUsageQuota.findOrCreate({
    where: { userId, periodMonth },
    defaults: { userId, periodMonth, tokensUsed: 0 },
  });

  if (row.tokensUsed >= limit) {
    throw new AppError(429, 'Monthly AI quota exceeded', 'AI_QUOTA_EXCEEDED');
  }

  return { limit, used: row.tokensUsed };
}

/** Call after a successful OpenAI response with the real token count consumed. */
export async function incrementAiQuota(userId: string, tokens: number): Promise<void> {
  await adjustAiQuota(userId, tokens);
}

export async function getAiQuotaForUser(userId: string): Promise<{ limit: number; used: number }> {
  const periodMonth = currentPeriodMonth();
  const limit = await resolveMonthlyLimit(userId);
  const row = await AiUsageQuota.findOne({ where: { userId, periodMonth } });
  return { limit, used: row?.tokensUsed ?? 0 };
}
