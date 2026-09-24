'use strict';

/**
 * Retires the legacy SMS / email / CSV parser's data (plan T6.3):
 * - pending `parsed_transactions` rows move into `detected_transactions` as low-confidence review
 *   items (review_reason `legacy_import`), so nothing the user was about to review is lost;
 * - every stored message text is erased (`raw_content` becomes NULL). The table itself is dropped
 *   in a later release, once no deployed code reads it.
 *
 * Safe to run twice: moved rows are keyed by `legacy_<id>` and skipped on conflict.
 * The erased text can't come back, so `down` only removes the moved review items.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    // A fresh database never had the table (the model is gone); nothing to retire.
    const [[{ exists }]] = await sequelize.query(`SELECT to_regclass('public.parsed_transactions') IS NOT NULL AS "exists"`);
    if (!exists) return;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `INSERT INTO "detected_transactions"
           ("id", "user_id", "amount", "currency", "direction", "transaction_type", "merchant", "normalized_merchant",
            "transaction_date", "confidence", "dedup_fingerprint", "source", "status", "review_reason",
            "evidence", "confidence_tier", "created_at", "updated_at")
         SELECT gen_random_uuid(), p."user_id", p."parsed_amount", COALESCE(NULLIF(u."currency", ''), 'INR'),
                CASE WHEN p."type" = 'income' THEN 'CREDIT' ELSE 'DEBIT' END,
                CASE WHEN p."type" = 'income' THEN 'income' ELSE 'expense' END,
                left(p."parsed_merchant", 255), left(p."parsed_merchant", 255),
                COALESCE(p."parsed_date", p."created_at"::date), 0.3,
                'legacy_' || p."id"::text,
                CASE p."source"::text WHEN 'sms' THEN 'pasted_sms' ELSE p."source"::text END,
                'pending_review', 'legacy_import', '{}'::jsonb, 'low', p."created_at", NOW()
         FROM "parsed_transactions" p
         JOIN "users" u ON u."id" = p."user_id"
         WHERE p."status" = 'pending' AND p."parsed_amount" > 0
         ON CONFLICT ("user_id", "dedup_fingerprint") DO NOTHING`,
        { transaction }
      );
      await sequelize.query(`ALTER TABLE "parsed_transactions" ALTER COLUMN "raw_content" DROP NOT NULL`, { transaction });
      await sequelize.query(`UPDATE "parsed_transactions" SET "raw_content" = NULL WHERE "raw_content" IS NOT NULL`, {
        transaction,
      });
    });
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize.query(
      `DELETE FROM "detected_transactions" WHERE "dedup_fingerprint" LIKE 'legacy\\_%' AND "status" = 'pending_review'`
    );
  },
};
