import { AiConversation, Transaction, Category } from '../../../../shared/models';
import type { AiMessage } from '../../../../shared/models/AiConversation';
import { AppError } from '../../../shared/utils/errors';
import { env } from '../../../shared/config/env';
import { Op, fn, col } from 'sequelize';
import {
  AI_COACH_CONFIG,
  buildCoachSystemPrompt,
  buildFinanceContext,
  buildFinanceContextMessage,
  chatCompletion,
  generateCoachFallback,
} from '../../../../shared/ai';

export async function getSpendingInsights(userId: string) {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [thisMonth, lastMonth, byCategory] = await Promise.all([
    Transaction.sum('amount', {
      where: { userId, type: 'expense', date: { [Op.gte]: thisMonthStart } },
    }),
    Transaction.sum('amount', {
      where: {
        userId,
        type: 'expense',
        date: { [Op.gte]: lastMonthStart, [Op.lte]: lastMonthEnd },
      },
    }),
    Transaction.findAll({
      where: { userId, type: 'expense', date: { [Op.gte]: thisMonthStart } },
      attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      group: ['categoryId', 'category.id', 'category.name'],
      raw: true,
    }),
  ]);

  const current = Number(thisMonth ?? 0);
  const previous = Number(lastMonth ?? 0);
  const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  const insights: string[] = [];
  if (changePercent > 5) {
    insights.push(`You spent ${Math.round(changePercent)}% more this month compared to last month.`);
  } else if (changePercent < -5) {
    insights.push(`Great job! You spent ${Math.abs(Math.round(changePercent))}% less this month.`);
  }

  const topCategory = [...byCategory].sort(
    (a, b) =>
      Number((b as unknown as { total: string }).total) -
      Number((a as unknown as { total: string }).total)
  )[0] as unknown as { category?: { name: string }; total: string } | undefined;

  if (topCategory?.category) {
    insights.push(
      `Your top spending category this month is ${topCategory.category.name} at ₹${Number(topCategory.total).toFixed(0)}.`
    );
  }

  if (insights.length === 0) {
    insights.push('Your spending is stable this month. Keep tracking to build better habits.');
  }

  return { insights, summary: { current, previous, changePercent } };
}

function titleFromMessage(message: string): string {
  const cleaned = message.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Conversation';
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

export async function chatWithCoach(userId: string, message: string, conversationId?: string) {
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

  let assistantContent: string;

  if (env.OPENAI_API_KEY) {
    try {
      assistantContent = await chatCompletion({
        apiKey: env.OPENAI_API_KEY,
        messages: [
          {
            role: 'system',
            content: buildCoachSystemPrompt({
              currency: context.currency,
              userName: context.userName,
            }),
          },
          {
            role: 'system',
            content: buildFinanceContextMessage(context.text),
          },
          ...historyForModel.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ],
      });
    } catch {
      assistantContent = generateCoachFallback(message, context);
    }
  } else {
    assistantContent = generateCoachFallback(message, context);
  }

  const assistantMessage: AiMessage = {
    role: 'assistant',
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  const messages = [...priorMessages, userMessage, assistantMessage];
  const shouldTitle =
    !conversation.title || conversation.title === 'New Conversation';

  await conversation.update({
    messages,
    ...(shouldTitle ? { title: titleFromMessage(message) } : {}),
  });

  return {
    conversationId: conversation.id,
    message: assistantMessage,
    reply: assistantContent,
    messages,
  };
}

export async function detectAnomalies(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const transactions = await Transaction.findAll({
    where: { userId, type: 'expense', date: { [Op.gte]: thirtyDaysAgo } },
    order: [['amount', 'DESC']],
  });

  if (transactions.length < 5) return { anomalies: [] };

  const amounts = transactions.map((t) => Number(t.amount));
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const threshold = avg * 3;

  const anomalies = transactions
    .filter((t) => Number(t.amount) > threshold)
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      amount: t.amount,
      merchant: t.merchant,
      date: t.date,
      reason: `Unusually high expense (${Math.round(Number(t.amount) / avg)}x average)`,
    }));

  const merchantCounts = new Map<string, number>();
  transactions.forEach((t) => {
    if (t.merchant) {
      merchantCounts.set(t.merchant, (merchantCounts.get(t.merchant) ?? 0) + 1);
    }
  });

  merchantCounts.forEach((count, merchant) => {
    if (count >= 2) {
      const dupes = transactions.filter((t) => t.merchant === merchant);
      if (dupes.length >= 2) {
        anomalies.push({
          id: dupes[0].id,
          amount: dupes[0].amount,
          merchant,
          date: dupes[0].date,
          reason: `Possible duplicate expenses at ${merchant}`,
        });
      }
    }
  });

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
