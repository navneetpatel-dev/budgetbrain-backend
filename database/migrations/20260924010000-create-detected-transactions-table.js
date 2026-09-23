'use strict';

/**
 * Migration to create detected_transactions table with:
 * - Strict composite unique index on (user_id, dedup_fingerprint) for O(1) deduplication
 * - Fast watermarking index on (user_id, transaction_date DESC)
 * - Partial index for fast pending review queries
 * - Full foreign key constraints for integrity
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "detected_transactions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "amount" DECIMAL(15, 2) NOT NULL,
        "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
        "direction" VARCHAR(10) NOT NULL,
        "transaction_type" VARCHAR(20) NOT NULL DEFAULT 'expense',
        "merchant" VARCHAR(255),
        "normalized_merchant" VARCHAR(255),
        "category_id" UUID REFERENCES "categories"("id") ON DELETE SET NULL,
        "financial_account_id" UUID REFERENCES "financial_accounts"("id") ON DELETE SET NULL,
        "account_tail" VARCHAR(10),
        "reference_number" VARCHAR(100),
        "institution_name" VARCHAR(100),
        "transaction_date" DATE NOT NULL,
        "confidence" FLOAT NOT NULL DEFAULT 0.0,
        "dedup_fingerprint" VARCHAR(64) NOT NULL,
        "source" VARCHAR(20) NOT NULL DEFAULT 'android_sms',
        "status" VARCHAR(20) NOT NULL DEFAULT 'auto_approved',
        "created_transaction_id" UUID REFERENCES "transactions"("id") ON DELETE SET NULL,
        "metadata" JSONB,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    // Unique constraint: prevent same transaction fingerprint twice per user
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_detected_transactions_user_fingerprint"
      ON "detected_transactions" ("user_id", "dedup_fingerprint");
    `);

    // Watermark check: fast retrieval of latest synced transaction date
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_detected_transactions_user_date"
      ON "detected_transactions" ("user_id", "transaction_date" DESC);
    `);

    // Review inbox: partial index for zero-cost pending review lookups
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_detected_transactions_pending_review"
      ON "detected_transactions" ("user_id", "created_at" DESC)
      WHERE "status" = 'pending_review';
    `);

    // Foreign key indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_detected_transactions_created_transaction_id"
      ON "detected_transactions" ("created_transaction_id");
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_detected_transactions_category_id"
      ON "detected_transactions" ("category_id");
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_detected_transactions_financial_account_id"
      ON "detected_transactions" ("financial_account_id");
    `);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DROP TABLE IF EXISTS "detected_transactions" CASCADE;`).catch(() => {});
  },
};
