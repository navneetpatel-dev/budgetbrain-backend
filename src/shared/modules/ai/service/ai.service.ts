import { convertAndSum } from '@shared/currency/currency.engine';
import { AiConversation, Transaction, Category, RecurringSeries, Budget, User } from '@database/models';
import type { AiMessage } from '@database/models';
import { AppError } from '@shared/errors';
import { env } from '@config/env';
import { Op } from 'sequelize';
import {
  AI_COACH_CONFIG,
  buildCoachSystemPrompt,
  buildFinanceContext,
  buildFinanceContextMessage,
  chatCompletion,
  streamChatCompletion,
  generateCoachFallback,
} from '@shared/ai';
import type { ChatMessage } from '@shared/ai';
import { runAnomalyDetection } from '@shared/ai/anomalyDetection.engine';
import { reserveAiQuota, adjustAiQuota } from './aiQuota.service';

export interface StructuredInsight {
  kind: 'monthly_comparison' | 'top_category' | 'saving_opportunity' | 'budget_recommendation';
  title: string;
  message: string;
  amount?: number;
  category?: string;
  changePercent?: number;
}

/**
 * Pure decision logic for a single category's budget recommendation, kept separate from
 * `getSpendingInsights`'s DB fetches so it's unit-testable with fixed fixtures (mirrors
 * `anomalyDetection.engine.ts`'s pure-function-over-black-box approach).
 */
export function buildBudgetRecommendation(input: {
  catName: string;
  budgetAmount: number;
  catSpent: number;
  daysPassed: number;
  daysRemaining: number;
  daysInMonth: number;
}): StructuredInsight | null {
  const { catName, budgetAmount, catSpent, daysPassed, daysRemaining, daysInMonth } = input;
  if (budgetAmount <= 0) return null;
  const percentUsed = (catSpent / budgetAmount) * 100;

  if (percentUsed > 100) {
    const projectedMonthly = daysPassed > 0 ? (catSpent / daysPassed) * daysInMonth : catSpent;
    const suggested = Math.ceil(projectedMonthly / 100) * 100;
    return {
      kind: 'budget_recommendation',
      title: `Raise ${catName} Budget`,
      message: `Your ${catName} budget is already ${Math.round(percentUsed)}% used this month. Based on your pace, consider raising it to about ₹${suggested.toFixed(0)} next month.`,
      category: catName,
      amount: suggested,
    };
  }

  if (percentUsed < 40 && daysRemaining <= 3) {
    const suggested = Math.max(0, Math.floor((catSpent * 1.15) / 100) * 100);
    return {
      kind: 'budget_recommendation',
      title: `Reallocate ${catName} Budget`,
      message: `You have only used ${Math.round(percentUsed)}% of your ${catName} budget with the month almost over. Consider lowering it to about ₹${suggested.toFixed(0)} and reallocating the difference toward savings.`,
      category: catName,
      amount: suggested,
    };
  }

  return null;
}

export async function getSpendingInsights(userId: string) {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = now.getDate();
  const daysRemaining = daysInMonth - daysPassed;

  const user = await User.findByPk(userId, { attributes: ['currency'] });
  const currency = user?.currency ?? 'INR';

  const [thisMonthRows, lastMonthRows, expenseRows, budgets, recurringSeries] = await Promise.all([
    Transaction.findAll({
      where: { userId, type: 'expense', date: { [Op.gte]: thisMonthStart } },
      attributes: ['amount', 'currency'],
      raw: true,
    }),
    Transaction.findAll({
      where: {
        userId,
        type: 'expense',
        date: { [Op.gte]: lastMonthStart, [Op.lte]: lastMonthEnd },
      },
      attributes: ['amount', 'currency'],
      raw: true,
    }),
    Transaction.findAll({
      where: { userId, type: 'expense', date: { [Op.gte]: thisMonthStart } },
      attributes: ['categoryId', 'amount', 'currency'],
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
    }),
    Budget.findAll({
      where: { userId },
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
    }),
    RecurringSeries.findAll({
      where: { userId, active: true },
    }),
  ]);

  const current = await convertAndSum(thisMonthRows, currency);
  const previous = await convertAndSum(lastMonthRows, currency);
  const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  const byCategoryMap = new Map<string, { categoryId: string | null; total: number; category?: { name: string } }>();
  for (const row of expenseRows) {
    const key = row.categoryId ?? 'uncategorized';
    const converted = await convertAndSum([{ amount: row.amount, currency: row.currency }], currency);
    const existing = byCategoryMap.get(key);
    if (existing) existing.total += converted;
    else {
      byCategoryMap.set(key, {
        categoryId: row.categoryId,
        total: converted,
        category: (row as Transaction & { category?: { name: string } }).category,
      });
    }
  }
  const byCategory = [...byCategoryMap.values()];

  const insights: string[] = [];
  const structuredInsights: StructuredInsight[] = [];

  // 1. Monthly comparison
  if (changePercent > 5) {
    const msg = `You spent ${Math.round(changePercent)}% more this month compared to last month.`;
    insights.push(msg);
    structuredInsights.push({
      kind: 'monthly_comparison',
      title: 'Spending Increased',
      message: msg,
      changePercent: Math.round(changePercent),
      amount: current,
    });
  } else if (changePercent < -5) {
    const msg = `Great job! You spent ${Math.abs(Math.round(changePercent))}% less this month.`;
    insights.push(msg);
    structuredInsights.push({
      kind: 'monthly_comparison',
      title: 'Spending Reduced',
      message: msg,
      changePercent: Math.round(changePercent),
      amount: current,
    });
  } else {
    const msg = 'Your spending is stable compared to last month.';
    insights.push(msg);
    structuredInsights.push({
      kind: 'monthly_comparison',
      title: 'Stable Spending',
      message: msg,
      changePercent: 0,
      amount: current,
    });
  }

  // 2. Top spending category
  const topCategory = [...byCategory].sort((a, b) => b.total - a.total)[0];

  if (topCategory?.category) {
    const catName = topCategory.category.name;
    const catTotal = topCategory.total;
    const msg = `Your top spending category this month is ${catName} at ₹${catTotal.toFixed(0)}.`;
    insights.push(msg);
    structuredInsights.push({
      kind: 'top_category',
      title: `${catName} is Top Expense`,
      message: msg,
      category: catName,
      amount: catTotal,
    });
  }

  // 3. Saving opportunities & Budget recommendations
  let savingOpportunityAdded = false;
  if (budgets.length > 0) {
    for (const b of budgets) {
      const budgetAmount = Number(b.amount);
      const catSpendItem = byCategory.find((c) => c.categoryId === b.categoryId);
      const catSpent = catSpendItem?.total ?? 0;
      const percentUsed = budgetAmount > 0 ? (catSpent / budgetAmount) * 100 : 0;

      if (percentUsed >= 80 && percentUsed <= 100 && daysRemaining > 5) {
        const catName = (b as any).category?.name || b.name;
        const msg = `You have used ${Math.round(percentUsed)}% of your ${catName} budget with ${daysRemaining} days remaining in the month.`;
        insights.push(msg);
        structuredInsights.push({
          kind: 'saving_opportunity',
          title: `Budget Pace Warning: ${catName}`,
          message: msg,
          category: catName,
          amount: catSpent,
        });
        savingOpportunityAdded = true;
        break;
      }
    }
  }

  if (!savingOpportunityAdded && recurringSeries.length > 0) {
    const totalRecurring = await convertAndSum(recurringSeries, currency);
    const msg = `You have ${recurringSeries.length} active recurring subscriptions totaling ₹${totalRecurring.toFixed(0)}/mo. Reviewing inactive services could free up cash flow.`;
    insights.push(msg);
    structuredInsights.push({
      kind: 'saving_opportunity',
      title: 'Review Recurring Services',
      message: msg,
      amount: totalRecurring,
    });
  } else if (!savingOpportunityAdded) {
    const msg = 'Setting up monthly category budgets will help unlock automated savings recommendations.';
    insights.push(msg);
    structuredInsights.push({
      kind: 'saving_opportunity',
      title: 'Build Budget Goals',
      message: msg,
    });
  }

  // 4. Budget recommendations — distinct from saving opportunities: suggests a concrete
  // budget-amount adjustment for next month based on this month's actual pace, reusing the
  // same budgets/byCategory data already fetched above (no re-summing).
  for (const b of budgets) {
    const catSpendItem = byCategory.find((c) => c.categoryId === b.categoryId);
    const catSpent = catSpendItem?.total ?? 0;
    const catName = (b as any).category?.name || b.name;

    const recommendation = buildBudgetRecommendation({
      catName,
      budgetAmount: Number(b.amount),
      catSpent,
      daysPassed,
      daysRemaining,
      daysInMonth,
    });

    if (recommendation) {
      insights.push(recommendation.message);
      structuredInsights.push(recommendation);
      break;
    }
  }

  return {
    insights,
    structuredInsights,
    summary: { current, previous, changePercent },
  };
}

function titleFromMessage(message: string): string {
  const cleaned = message.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Conversation';
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

/**
 * Shared setup for both the non-streaming and streaming coach paths: resolves the
 * finance context + conversation + trimmed history, and builds the exact message list
 * sent to OpenAI. Keeping this in one place is what guarantees streaming and
 * non-streaming replies are grounded in identical context.
 */
async function prepareCoachTurn(userId: string, message: string, conversationId?: string) {
  const [context, existingConversation] = await Promise.all([
    buildFinanceContext(userId),
    conversationId
      ? AiConversation.findOne({ where: { id: conversationId, userId } })
      : Promise.resolve(null),
  ]);

  const conversation =
    existingConversation ?? (await AiConversation.create({ userId, messages: [] }));

  const userMessage: AiMessage = {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  };

  const priorMessages = (conversation.messages ?? []).filter(
    (m): m is AiMessage => m.role === 'user' || m.role === 'assistant'
  );
  const historyForModel = priorMessages.slice(-AI_COACH_CONFIG.historyLimit);

  const openAiMessages: ChatMessage[] = [
    {
      role: 'system',
      content: buildCoachSystemPrompt({
        currency: context.currency,
        userName: context.userName,
      }),
    },
    { role: 'system', content: buildFinanceContextMessage(context.text) },
    ...historyForModel.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: 'user', content: message },
  ];

  return { context, conversation, userMessage, priorMessages, openAiMessages };
}

/** Persists the assistant's reply onto the conversation, shared by both coach paths. */
async function finalizeCoachTurn(
  conversation: AiConversation,
  priorMessages: AiMessage[],
  userMessage: AiMessage,
  assistantContent: string,
  originalMessage: string
) {
  const assistantMessage: AiMessage = {
    role: 'assistant',
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  const messages = [...priorMessages, userMessage, assistantMessage];
  const shouldTitle = !conversation.title || conversation.title === 'New Conversation';

  await conversation.update({
    messages,
    ...(shouldTitle ? { title: titleFromMessage(originalMessage) } : {}),
  });

  return { assistantMessage, messages };
}

export async function chatWithCoach(userId: string, message: string, conversationId?: string) {
  const { reserved } = await reserveAiQuota(userId);

  const { context, conversation, userMessage, priorMessages, openAiMessages } =
    await prepareCoachTurn(userId, message, conversationId);

  let assistantContent: string;

  if (env.OPENAI_API_KEY) {
    try {
      const completion = await chatCompletion({ apiKey: env.OPENAI_API_KEY, messages: openAiMessages });
      assistantContent = completion.content;
      await adjustAiQuota(userId, (completion.usage.totalTokens ?? 0) - reserved);
    } catch (err) {
      await adjustAiQuota(userId, -reserved);
      if (err instanceof AppError) throw err;
      assistantContent = generateCoachFallback(message, context);
    }
  } else {
    await adjustAiQuota(userId, -reserved);
    assistantContent = generateCoachFallback(message, context);
  }

  const { assistantMessage, messages } = await finalizeCoachTurn(
    conversation,
    priorMessages,
    userMessage,
    assistantContent,
    message
  );

  return {
    conversationId: conversation.id,
    message: assistantMessage,
    reply: assistantContent,
    messages,
  };
}

/**
 * Streaming variant of chatWithCoach: invokes `onToken` per content delta as it arrives,
 * then persists the fully-assembled reply exactly like the non-streaming path once the
 * stream completes. Falls back to the non-streaming coach fallback (no fake streaming of
 * a canned reply) when OpenAI isn't configured or the request fails before any tokens
 * were emitted.
 */
export async function streamChatWithCoach(
  userId: string,
  message: string,
  conversationId: string | undefined,
  onToken: (delta: string) => void
) {
  const { reserved } = await reserveAiQuota(userId);

  const { context, conversation, userMessage, priorMessages, openAiMessages } =
    await prepareCoachTurn(userId, message, conversationId);

  let assistantContent: string;

  if (env.OPENAI_API_KEY) {
    try {
      const { deltas, done } = await streamChatCompletion({
        apiKey: env.OPENAI_API_KEY,
        messages: openAiMessages,
      });
      let emittedAny = false;
      for await (const delta of deltas) {
        emittedAny = true;
        onToken(delta);
      }
      const completion = await done;
      assistantContent = completion.content;
      await adjustAiQuota(userId, (completion.usage.totalTokens ?? 0) - reserved);
      if (!emittedAny) {
        // Defensive: shouldn't happen if `done` resolved, but never silently persist
        // an empty reply.
        throw new AppError(502, 'AI Coach returned an empty streamed response', 'AI_EMPTY_RESPONSE');
      }
    } catch (err) {
      if (err instanceof AppError) {
        if (err.code !== 'AI_EMPTY_RESPONSE') {
          await adjustAiQuota(userId, -reserved);
        }
        throw err;
      }
      await adjustAiQuota(userId, -reserved);
      assistantContent = generateCoachFallback(message, context);
      onToken(assistantContent);
    }
  } else {
    await adjustAiQuota(userId, -reserved);
    assistantContent = generateCoachFallback(message, context);
    onToken(assistantContent);
  }

  const { assistantMessage, messages } = await finalizeCoachTurn(
    conversation,
    priorMessages,
    userMessage,
    assistantContent,
    message
  );

  return {
    conversationId: conversation.id,
    message: assistantMessage,
    reply: assistantContent,
    messages,
  };
}

export async function detectAnomalies(userId: string) {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [transactions, recurringSeries] = await Promise.all([
    Transaction.findAll({
      where: { userId, type: 'expense', date: { [Op.gte]: sixtyDaysAgo } },
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      order: [['date', 'DESC']],
    }),
    RecurringSeries.findAll({
      where: { userId, active: true },
    }),
  ]);

  const txData = transactions.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    merchant: t.merchant,
    categoryId: t.categoryId,
    categoryName: (t as any).category?.name,
    date: new Date(t.date),
  }));

  const seriesData = recurringSeries.map((s) => ({
    id: s.id,
    merchant: s.merchant,
    amount: Number(s.amount),
    cadence: s.cadence,
  }));

  const anomalies = runAnomalyDetection(txData, seriesData);

  return { anomalies };
}


export async function listConversations(userId: string) {
  return AiConversation.findAll({
    where: { userId },
    attributes: ['id', 'title', 'createdAt', 'updatedAt'],
    order: [['updatedAt', 'DESC']],
  });
}

export async function getConversation(userId: string, id: string) {
  const conversation = await AiConversation.findOne({
    where: { id, userId },
    attributes: ['id', 'title', 'messages', 'createdAt', 'updatedAt'],
  });
  if (!conversation) throw new AppError(404, 'Conversation not found');
  return conversation;
}
