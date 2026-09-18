'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const { initModels } = require('../models');
    initModels(sequelize);
    await sequelize.sync({ alter: false });
  },

  async down(queryInterface, Sequelize) {
    // Drop in reverse dependency order
    const tables = [
      'expense_split_participants',
      'merchant_category_rules',
      'loan_payments',
      'loans',
      'recurring_series',
      'transaction_attachments',
      'parsed_transactions',
      'transactions',
      'budget_alerts',
      'budgets',
      'categories',
      'income_sources',
      'goal_contributions',
      'goals',
      'investments',
      'financial_accounts',
      'family_members',
      'family_groups',
      'ai_conversations',
      'audit_logs',
      'notifications',
      'devices',
      'refresh_tokens',
      'verification_tokens',
      'users',
    ];
    for (const table of tables) {
      await queryInterface.dropTable(table, { cascade: true }).catch(() => {});
    }
  },
};
