'use strict';

// Postgres does not auto-index foreign keys — only primary keys and explicit unique
// constraints get one. These per-user domain tables had no index at all beyond their
// primary key, so their most common query (`WHERE user_id = ?`) was a sequential scan.
const TABLES = [
  ['budgets', 'budgets_user_id_idx'],
  ['financial_accounts', 'financial_accounts_user_id_idx'],
  ['goals', 'goals_user_id_idx'],
  ['income_sources', 'income_sources_user_id_idx'],
  ['loans', 'loans_user_id_idx'],
  ['categories', 'categories_user_id_idx'],
  ['investments', 'investments_user_id_idx'],
];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const [table, idx] of TABLES) {
      await sequelize.query(`CREATE INDEX IF NOT EXISTS ${idx} ON "${table}" (user_id)`);
    }
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON "notifications" (user_id)`
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS notifications_user_id_sent_at_idx ON "notifications" (user_id, sent_at)`
    );
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    for (const [, idx] of TABLES) {
      await sequelize.query(`DROP INDEX IF EXISTS ${idx}`).catch(() => {});
    }
    await sequelize.query(`DROP INDEX IF EXISTS notifications_user_id_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS notifications_user_id_sent_at_idx`).catch(() => {});
  },
};
