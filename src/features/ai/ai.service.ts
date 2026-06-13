import { AiConversation, Transaction, Category } from '../../models';
import { AppError } from '../../utils/errors';
import { env } from '../../config/env';
import { Op, fn, col } from 'sequelize';

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

export async function chatWithCoach(userId: string, message: string, conversationId?: string) {
  let conversation: AiConversation | null = null;

  if (conversationId) {
    conversation = await AiConversation.findOne({ where: { id: conversationId, userId } });
  }

  if (!conversation) {
    conversation = await AiConversation.create({ userId, messages: [] });
  }

  const messages = [...conversation.messages, {
    role: 'user' as const,
    content: message,
    timestamp: new Date().toISOString(),
  }];

  let assistantContent: string;

  if (env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are ExpenseFlow AI Financial Coach. Provide concise, actionable budget and savings advice based on user questions. Use INR when mentioning amounts unless specified otherwise.',
            },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 500,
        }),
      });

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      assistantContent =
        data.choices?.[0]?.message?.content ??
        'I am unable to provide advice right now. Please try again.';
    } catch {
      assistantContent = generateFallbackResponse(message);
    }
  } else {
    assistantContent = generateFallbackResponse(message);
  }

  const assistantMessage = {
    role: 'assistant' as const,
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  messages.push(assistantMessage);

  await conversation.update({ messages });

  return {
    conversationId: conversation.id,
    message: assistantMessage,
    reply: assistantContent,
    messages,
  };
}

function generateFallbackResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('save') || lower.includes('saving')) {
    return 'Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings. Review your top 3 expense categories this week to find quick wins.';
  }
  if (lower.includes('budget')) {
    return 'Set category-based budgets for your top spending areas. Start with Food, Transportation, and Entertainment — these typically offer the most savings potential.';
  }
  return 'Track every expense for 2 weeks to identify patterns. Small recurring subscriptions often add up to significant monthly costs.';
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
