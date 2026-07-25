export const AI_COACH_CONFIG = {
  model: 'gpt-4o-mini',
  temperature: 0.4,
  maxTokens: 700,
  historyLimit: 20,
  recentTransactionsLimit: 10,
  topCategoriesLimit: 5,
  budgetsLimit: 5,
  goalsLimit: 5,
} as const;
