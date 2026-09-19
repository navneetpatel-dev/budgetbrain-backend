import { AiUsageQuota } from '@database/models';
import { AppError } from '@shared/errors';
import { env } from '@config/env';
import { getEntitlementForUser } from '@shared/modules/subscriptions';

function currentPeriodMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}

async function resolveMonthlyLimit(userId: string): Promise<number> {
  const entitlement = await getEntitlementForUser(userId, 'pro');
  return entitlement.isEntitled ? env.AI_PRO_MONTHLY_TOKEN_LIMIT : env.AI_FREE_MONTHLY_TOKEN_LIMIT;
}

/**
 * Throws AI_QUOTA_EXCEEDED if the user has already used up this month's token budget.
 * Call before making the OpenAI request that would consume more tokens.
 */
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
  if (!tokens || tokens <= 0) return;
  const periodMonth = currentPeriodMonth();
  const [row] = await AiUsageQuota.findOrCreate({
    where: { userId, periodMonth },
    defaults: { userId, periodMonth, tokensUsed: 0 },
  });
  await row.increment('tokensUsed', { by: tokens });
}

export async function getAiQuotaForUser(userId: string): Promise<{ limit: number; used: number }> {
  const periodMonth = currentPeriodMonth();
  const limit = await resolveMonthlyLimit(userId);
  const row = await AiUsageQuota.findOne({ where: { userId, periodMonth } });
  return { limit, used: row?.tokensUsed ?? 0 };
}
