'use strict';

/**
 * Migration to add:
 * 1. transactions.financial_account_id (UUID, nullable, FK to financial_accounts)
 * 2. recurring_series.auto_record (BOOLEAN, default false)
 * 3. parsed_transactions.type (VARCHAR(32), default 'expense')
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    // 1. Add financial_account_id to transactions
    await sequelize.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "financial_account_id" UUID
      REFERENCES "financial_accounts"("id") ON DELETE SET NULL;
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_financial_account_id"
      ON "transactions" ("financial_account_id");
    `);

    // 2. Add auto_record to recurring_series
    await sequelize.query(`
      ALTER TABLE "recurring_series"
      ADD COLUMN IF NOT EXISTS "auto_record" BOOLEAN NOT NULL DEFAULT false;
    `);

    // 3. Add type to parsed_transactions (absent on a fresh database: a later migration drops it)
    await sequelize.query(`
      ALTER TABLE IF EXISTS "parsed_transactions"
      ADD COLUMN IF NOT EXISTS "type" VARCHAR(32) NOT NULL DEFAULT 'expense';
    `);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(`DROP INDEX IF EXISTS "idx_transactions_financial_account_id";`).catch(() => {});
    await sequelize.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "financial_account_id";`).catch(() => {});
    await sequelize.query(`ALTER TABLE "recurring_series" DROP COLUMN IF EXISTS "auto_record";`).catch(() => {});
    await sequelize.query(`ALTER TABLE "parsed_transactions" DROP COLUMN IF EXISTS "type";`).catch(() => {});
  },
};
