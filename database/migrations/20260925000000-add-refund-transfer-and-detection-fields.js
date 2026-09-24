'use strict';

/**
 * Transaction detection, Phase 1 (implementation plan tasks T1.1 and T1.9).
 *
 * transactions
 * - type gains 'refund' and 'transfer', so neither inflates income or spending (gap P0-4, C6)
 * - payment_method gains 'wallet'
 * - subtype, direction (required for transfer legs), refund_of_transaction_id, transfer_group_id,
 *   source ('manual' | 'detected' | 'import' | 'open_banking') and detected_transaction_id
 *
 * detected_transactions
 * - institution_id, subtype, payment_method, review_reason, evidence, confidence_tier
 * - dedup_fingerprint widened to 80 characters for versioned core fingerprints ('v2_' + 64 hex)
 *
 * merchant_category_rules
 * - rules written by the old detection code kept the merchant's original casing, while manual
 *   entries store it lowercased; lowercase the rest, keeping the newest rule on collisions (gap L6)
 *
 * Every statement is idempotent: a fresh database already gets these columns from the models
 * via the initial-schema migration.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    // ALTER TYPE ... ADD VALUE must run as its own statement (see 20250107000000).
    for (const value of ['refund', 'transfer']) {
      try {
        await sequelize.query(`ALTER TYPE enum_transactions_type ADD VALUE IF NOT EXISTS '${value}'`);
      } catch {}
    }
    try {
      await sequelize.query(
        `ALTER TYPE enum_transactions_payment_method ADD VALUE IF NOT EXISTS 'wallet' BEFORE 'other'`
      );
    } catch {}

    await sequelize.query(`
      ALTER TABLE "transactions"
        ADD COLUMN IF NOT EXISTS "subtype" VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "direction" VARCHAR(6),
        ADD COLUMN IF NOT EXISTS "refund_of_transaction_id" UUID,
        ADD COLUMN IF NOT EXISTS "transfer_group_id" UUID,
        ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS "detected_transaction_id" UUID;
    `);

    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_refund_of_fk') THEN
          ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refund_of_fk"
            FOREIGN KEY ("refund_of_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_detected_fk') THEN
          ALTER TABLE "transactions" ADD CONSTRAINT "transactions_detected_fk"
            FOREIGN KEY ("detected_transaction_id") REFERENCES "detected_transactions"("id") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_direction_chk') THEN
          ALTER TABLE "transactions" ADD CONSTRAINT "transactions_direction_chk"
            CHECK ("direction" IS NULL OR "direction" IN ('DEBIT', 'CREDIT'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transfer_direction_chk') THEN
          ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_direction_chk"
            CHECK ("type"::text <> 'transfer' OR "direction" IS NOT NULL);
        END IF;
      END $$;
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_user_transfer_group"
      ON "transactions" ("user_id", "transfer_group_id")
      WHERE "transfer_group_id" IS NOT NULL;
    `);

    await sequelize.query(`
      ALTER TABLE "detected_transactions"
        ADD COLUMN IF NOT EXISTS "institution_id" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "subtype" VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "payment_method" VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "review_reason" VARCHAR(40),
        ADD COLUMN IF NOT EXISTS "evidence" JSONB,
        ADD COLUMN IF NOT EXISTS "confidence_tier" VARCHAR(10),
        ALTER COLUMN "dedup_fingerprint" TYPE VARCHAR(80);
    `);

    // Lowercase merchant rules, keeping the most recently updated one per (user, merchant).
    await sequelize.query(`
      DELETE FROM "merchant_category_rules" r
      USING "merchant_category_rules" newer
      WHERE r."user_id" = newer."user_id"
        AND lower(trim(r."merchant")) = lower(trim(newer."merchant"))
        AND r."id" <> newer."id"
        AND (r."updated_at", r."id") < (newer."updated_at", newer."id");
    `);
    await sequelize.query(`
      UPDATE "merchant_category_rules"
      SET "merchant" = lower(trim("merchant"))
      WHERE "merchant" <> lower(trim("merchant"));
    `);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    // Enum values can't be removed in PostgreSQL (see 20250107000000); rows using them must be
    // converted by hand before a real rollback. Columns and constraints are dropped.
    await sequelize.query(`DROP INDEX IF EXISTS "idx_transactions_user_transfer_group";`);
    await sequelize.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT IF EXISTS "transactions_transfer_direction_chk",
        DROP CONSTRAINT IF EXISTS "transactions_direction_chk",
        DROP CONSTRAINT IF EXISTS "transactions_detected_fk",
        DROP CONSTRAINT IF EXISTS "transactions_refund_of_fk",
        DROP COLUMN IF EXISTS "detected_transaction_id",
        DROP COLUMN IF EXISTS "source",
        DROP COLUMN IF EXISTS "transfer_group_id",
        DROP COLUMN IF EXISTS "refund_of_transaction_id",
        DROP COLUMN IF EXISTS "direction",
        DROP COLUMN IF EXISTS "subtype";
    `);
    await sequelize.query(`
      ALTER TABLE "detected_transactions"
        DROP COLUMN IF EXISTS "confidence_tier",
        DROP COLUMN IF EXISTS "evidence",
        DROP COLUMN IF EXISTS "review_reason",
        DROP COLUMN IF EXISTS "payment_method",
        DROP COLUMN IF EXISTS "subtype",
        DROP COLUMN IF EXISTS "institution_id";
    `);
  },
};
