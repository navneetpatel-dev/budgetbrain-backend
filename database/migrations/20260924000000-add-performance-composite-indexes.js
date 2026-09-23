'use strict';

/**
 * Composite performance indexes targeting the most latency-critical query patterns:
 * 1. Transactions listing with sort: (user_id, date DESC, created_at DESC)
 * 2. Transactions by type and date (summaries, income, and spending trends): (user_id, type, date DESC)
 * 3. Notifications badge and filter: (user_id, sent_at DESC, read)
 * 4. Active financial accounts: (user_id, is_active)
 * 5. Budget alerts by user: (user_id, triggered_at DESC)
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_date_created
      ON "transactions" (user_id, date DESC, created_at DESC);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
      ON "transactions" (user_id, type, date DESC);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_sent_read
      ON "notifications" (user_id, sent_at DESC, read);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_financial_accounts_user_active
      ON "financial_accounts" (user_id, is_active);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_budget_alerts_user_triggered
      ON "budget_alerts" (user_id, triggered_at DESC);
    `);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(`DROP INDEX IF EXISTS idx_transactions_user_date_created;`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS idx_transactions_user_type_date;`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS idx_notifications_user_sent_read;`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS idx_financial_accounts_user_active;`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS idx_budget_alerts_user_triggered;`).catch(() => {});
  },
};
