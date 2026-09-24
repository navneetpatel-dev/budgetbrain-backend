'use strict';

/**
 * Drops the legacy parser's staging table (plan T6.3, second step). The previous release moved
 * its pending rows into review and erased every stored message text
 * (20260927000000-retire-parsed-transactions); no code reads the table any more.
 *
 * `down` recreates the table empty with its last shape, so older migrations can still roll back;
 * the rows are not restored.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`DROP TABLE IF EXISTS "parsed_transactions"`, { transaction });
      await sequelize.query(`DROP TYPE IF EXISTS "enum_parsed_transactions_source"`, { transaction });
      await sequelize.query(`DROP TYPE IF EXISTS "enum_parsed_transactions_status"`, { transaction });
    });
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `DO $$ BEGIN
           CREATE TYPE "enum_parsed_transactions_source" AS ENUM ('sms', 'email', 'csv');
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
         DO $$ BEGIN
           CREATE TYPE "enum_parsed_transactions_status" AS ENUM ('pending', 'confirmed', 'rejected');
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        { transaction }
      );
      await sequelize.query(
        `CREATE TABLE IF NOT EXISTS "parsed_transactions" (
           "id" UUID PRIMARY KEY,
           "user_id" UUID NOT NULL REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
           "source" "enum_parsed_transactions_source" NOT NULL,
           "type" VARCHAR(32) NOT NULL DEFAULT 'expense',
           "raw_content" TEXT,
           "parsed_amount" DECIMAL(15, 2),
           "parsed_merchant" VARCHAR(255),
           "parsed_date" DATE,
           "confidence" DOUBLE PRECISION DEFAULT 0,
           "status" "enum_parsed_transactions_status" DEFAULT 'pending',
           "transaction_id" UUID REFERENCES "transactions" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
           "created_at" TIMESTAMPTZ NOT NULL,
           "updated_at" TIMESTAMPTZ NOT NULL
         );
         CREATE INDEX IF NOT EXISTS "parsed_transactions_user_id_idx" ON "parsed_transactions" ("user_id");
         CREATE INDEX IF NOT EXISTS "parsed_transactions_transaction_id_idx" ON "parsed_transactions" ("transaction_id");`,
        { transaction }
      );
    });
  },
};
