'use strict';

/**
 * Phase 7 of the transaction-detection plan: diagnostics, admin rollups and learning.
 *
 * - detection_diagnostics_daily (T7.1): per-user daily counts of where messages stopped
 *   (stage, reason code, institution). No text, no amounts.
 * - detection_daily_stats + detection_rollup_state (T7.2): hourly rollups the admin dashboard
 *   reads instead of scanning detected_transactions; the state row holds the watermark.
 * - detection_skeleton_submissions (T7.4): opt-in message skeletons, keyed by an HMAC of the
 *   user id so k-anonymity can be counted without storing who sent what.
 * - kb_catalog_history (T7.3): every admin change to a catalog row, with its data and status.
 * - users.detection_template_learning (D-5): the opt-in, off by default.
 * - kb_templates.sample (T7.4): a synthetic message a published template must match.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    const q = (sql) => sequelize.query(sql);

    await q(`
      CREATE TABLE IF NOT EXISTS "detection_diagnostics_daily" (
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "day" DATE NOT NULL,
        "stage" VARCHAR(30) NOT NULL,
        "reason_code" VARCHAR(60) NOT NULL,
        "institution_id" VARCHAR(80) NOT NULL DEFAULT '',
        "count" INTEGER NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("user_id", "day", "stage", "reason_code", "institution_id")
      );
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_detection_diagnostics_day" ON "detection_diagnostics_daily" ("day");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "detection_daily_stats" (
        "day" DATE NOT NULL,
        "country" VARCHAR(2) NOT NULL DEFAULT '',
        "institution_id" VARCHAR(80) NOT NULL DEFAULT '',
        "source" VARCHAR(20) NOT NULL,
        "status" VARCHAR(20) NOT NULL,
        "count" INTEGER NOT NULL,
        "users" INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY ("day", "country", "institution_id", "source", "status")
      );
    `);
    await q(`
      CREATE TABLE IF NOT EXISTS "detection_rollup_state" (
        "key" VARCHAR(60) PRIMARY KEY,
        "value" JSONB NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    // The rollup finds changed rows by updated_at.
    await q(`CREATE INDEX IF NOT EXISTS "idx_detected_transactions_updated_at" ON "detected_transactions" ("updated_at");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "detection_skeleton_submissions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "skeleton_hash" CHAR(64) NOT NULL,
        "user_hash" CHAR(64) NOT NULL,
        "institution_id" VARCHAR(80),
        "sender_key" VARCHAR(200) NOT NULL DEFAULT '',
        "country" VARCHAR(2) NOT NULL DEFAULT '',
        "language" VARCHAR(20),
        "skeleton" TEXT NOT NULL,
        "corrected_field" VARCHAR(30),
        "status" VARCHAR(20) NOT NULL DEFAULT 'new' CHECK ("status" IN ('new', 'templated', 'dismissed')),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_detection_skeleton_submissions"
      ON "detection_skeleton_submissions" ("skeleton_hash", "user_hash");
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_detection_skeleton_submissions_user" ON "detection_skeleton_submissions" ("user_hash");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_catalog_history" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "entity" VARCHAR(40) NOT NULL,
        "entity_id" VARCHAR(200) NOT NULL,
        "version" INTEGER NOT NULL,
        "status" VARCHAR(20) NOT NULL,
        "action" VARCHAR(20) NOT NULL,
        "data" JSONB NOT NULL,
        "changed_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_catalog_history_entity" ON "kb_catalog_history" ("entity", "entity_id", "created_at" DESC);`);

    await q(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "detection_template_learning" BOOLEAN NOT NULL DEFAULT FALSE;`);
    await q(`ALTER TABLE "kb_templates" ADD COLUMN IF NOT EXISTS "sample" TEXT;`);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    const q = (sql) => sequelize.query(sql);
    await q(`ALTER TABLE "kb_templates" DROP COLUMN IF EXISTS "sample";`);
    await q(`ALTER TABLE "users" DROP COLUMN IF EXISTS "detection_template_learning";`);
    await q(`DROP TABLE IF EXISTS "kb_catalog_history";`);
    await q(`DROP TABLE IF EXISTS "detection_skeleton_submissions";`);
    await q(`DROP INDEX IF EXISTS "idx_detected_transactions_updated_at";`);
    await q(`DROP TABLE IF EXISTS "detection_rollup_state";`);
    await q(`DROP TABLE IF EXISTS "detection_daily_stats";`);
    await q(`DROP TABLE IF EXISTS "detection_diagnostics_daily";`);
  },
};
