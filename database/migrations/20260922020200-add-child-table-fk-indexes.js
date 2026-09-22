'use strict';

const INDEXES = [
  ['expense_split_participants', 'esp_transaction_id_idx', 'transaction_id'],
  ['expense_split_participants', 'esp_group_id_idx', 'group_id'],
  ['expense_split_participants', 'esp_user_id_idx', 'user_id'],
  ['family_members', 'family_members_group_id_idx', 'group_id'],
  ['family_members', 'family_members_user_id_idx', 'user_id'],
  ['parsed_transactions', 'parsed_transactions_user_id_idx', 'user_id'],
  ['parsed_transactions', 'parsed_transactions_transaction_id_idx', 'transaction_id'],
  ['transaction_attachments', 'transaction_attachments_transaction_id_idx', 'transaction_id'],
  ['goal_contributions', 'goal_contributions_goal_id_idx', 'goal_id'],
  ['goal_contributions', 'goal_contributions_user_id_idx', 'user_id'],
  ['loan_payments', 'loan_payments_loan_id_idx', 'loan_id'],
  ['loan_payments', 'loan_payments_user_id_idx', 'user_id'],
  ['income_allocations', 'income_allocations_transaction_id_idx', 'transaction_id'],
  ['income_allocations', 'income_allocations_financial_account_id_idx', 'financial_account_id'],
];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const [table, idx, column] of INDEXES) {
      await sequelize.query(`CREATE INDEX IF NOT EXISTS ${idx} ON "${table}" (${column})`);
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const [, idx] of INDEXES) {
      await sequelize.query(`DROP INDEX IF EXISTS ${idx}`).catch(() => {});
    }
  },
};
