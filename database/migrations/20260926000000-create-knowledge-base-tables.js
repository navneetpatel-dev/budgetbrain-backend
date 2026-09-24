'use strict';

/**
 * Knowledge base for transaction detection (implementation plan T4.1, gap-doc §6.1–6.5, §6.9).
 *
 * Every catalog row has `status` (draft → review → published) and `version`; only published
 * rows go into knowledge packs. `source` names the importer or admin action that wrote the row,
 * so a re-run of one importer never overwrites another's data.
 */
const STATUS = `"status" VARCHAR(10) NOT NULL DEFAULT 'published' CHECK ("status" IN ('draft', 'review', 'published'))`;
const COMMON = `${STATUS},
        "version" INTEGER NOT NULL DEFAULT 1,
        "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()`;

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_institutions" (
        "id" VARCHAR(80) PRIMARY KEY,
        "name" VARCHAR(200) NOT NULL,
        "display_name" VARCHAR(120) NOT NULL,
        "country" CHAR(2) NOT NULL,
        "type" VARCHAR(20) NOT NULL,
        "bic" VARCHAR(11),
        "codes" JSONB NOT NULL DEFAULT '{}',
        "domains" JSONB NOT NULL DEFAULT '[]',
        "verified" BOOLEAN NOT NULL DEFAULT FALSE,
        ${COMMON}
      );
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_institutions_country" ON "kb_institutions" ("country", "status");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_institution_senders" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "institution_id" VARCHAR(80) NOT NULL REFERENCES "kb_institutions"("id") ON DELETE CASCADE,
        "country" CHAR(2) NOT NULL,
        "channel" VARCHAR(20) NOT NULL CHECK ("channel" IN ('sms', 'email', 'notification')),
        "match" VARCHAR(10) NOT NULL CHECK ("match" IN ('header', 'exact', 'domain')),
        "sender_key" VARCHAR(200) NOT NULL,
        ${COMMON}
      );
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_institution_senders_key"
      ON "kb_institution_senders" ("country", "channel", "sender_key");
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_institution_senders_institution" ON "kb_institution_senders" ("institution_id");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_lexicons" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "language" VARCHAR(20) NOT NULL,
        "class" VARCHAR(40) NOT NULL,
        "phrases" JSONB NOT NULL DEFAULT '[]',
        ${COMMON}
      );
    `);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_lexicons_language_class" ON "kb_lexicons" ("language", "class");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_templates" (
        "id" VARCHAR(120) PRIMARY KEY,
        "institution_id" VARCHAR(80) NOT NULL REFERENCES "kb_institutions"("id") ON DELETE CASCADE,
        "language" VARCHAR(20) NOT NULL,
        "skeleton" TEXT NOT NULL,
        "field_map" JSONB NOT NULL,
        "direction" VARCHAR(10) NOT NULL,
        "transaction_type" VARCHAR(20) NOT NULL,
        "subtype" VARCHAR(20),
        "payment_method" VARCHAR(20),
        "date_order" VARCHAR(3),
        ${COMMON}
      );
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_templates_institution" ON "kb_templates" ("institution_id", "status");`);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_category_taxonomy" (
        "code" VARCHAR(80) PRIMARY KEY,
        "parent" VARCHAR(80) REFERENCES "kb_category_taxonomy"("code") ON DELETE SET NULL,
        "name" VARCHAR(120) NOT NULL,
        ${COMMON}
      );
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_merchants" (
        "id" VARCHAR(80) PRIMARY KEY,
        "canonical_name" VARCHAR(200) NOT NULL,
        "wikidata_id" VARCHAR(20),
        "domain" VARCHAR(200),
        "country" CHAR(2),
        "taxonomy_code" VARCHAR(80) NOT NULL REFERENCES "kb_category_taxonomy"("code"),
        "mcc" VARCHAR(4),
        ${COMMON}
      );
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_merchants_country" ON "kb_merchants" ("country", "status");`);

    // Global aliases use country = '' so the unique index covers them too.
    await q(`
      CREATE TABLE IF NOT EXISTS "kb_merchant_aliases" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "merchant_id" VARCHAR(80) NOT NULL REFERENCES "kb_merchants"("id") ON DELETE CASCADE,
        "alias_key" VARCHAR(200) NOT NULL,
        "country" VARCHAR(2) NOT NULL DEFAULT '',
        ${COMMON}
      );
    `);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_merchant_aliases_key" ON "kb_merchant_aliases" ("alias_key", "country");`);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_merchant_aliases_merchant" ON "kb_merchant_aliases" ("merchant_id");`);
    // Trigram search for the admin catalog only. Managed Postgres may refuse the extension; the
    // index is optional, so a refusal is not an error.
    try {
      await q(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      await q(`CREATE INDEX IF NOT EXISTS "idx_kb_merchant_aliases_trgm" ON "kb_merchant_aliases" USING GIN ("alias_key" gin_trgm_ops);`);
    } catch (error) {
      console.warn('pg_trgm unavailable; skipping the alias search index', error.message);
    }

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_mcc_categories" (
        "mcc" VARCHAR(4) PRIMARY KEY,
        "taxonomy_code" VARCHAR(80) NOT NULL REFERENCES "kb_category_taxonomy"("code"),
        "description" VARCHAR(200),
        ${COMMON}
      );
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_currencies" (
        "code" CHAR(3) PRIMARY KEY,
        "minor_units" SMALLINT NOT NULL,
        "symbols" JSONB NOT NULL DEFAULT '[]',
        "ambiguous_symbols" JSONB NOT NULL DEFAULT '[]',
        "decimal_separator" CHAR(1) NOT NULL DEFAULT '.',
        "group_separator" VARCHAR(1) NOT NULL DEFAULT ',',
        "grouping" VARCHAR(10) NOT NULL DEFAULT 'standard',
        ${COMMON}
      );
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_payment_rails" (
        "id" VARCHAR(40) PRIMARY KEY,
        "name" VARCHAR(80) NOT NULL,
        "payment_method" VARCHAR(20) NOT NULL,
        "countries" JSONB,
        "keywords" JSONB NOT NULL DEFAULT '[]',
        ${COMMON}
      );
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS "kb_kill_switches" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "scope" VARCHAR(20) NOT NULL CHECK ("scope" IN ('institution', 'template', 'country', 'pack', 'app_version')),
        "key" VARCHAR(120) NOT NULL,
        "action" VARCHAR(30) NOT NULL CHECK ("action" IN ('disable_auto_create', 'disable_detection')),
        "reason" VARCHAR(500),
        "active" BOOLEAN NOT NULL DEFAULT TRUE,
        "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_kill_switches_active"
      ON "kb_kill_switches" ("scope", "key", "action") WHERE "active";
    `);

    // One row per built pack file: a full pack (base_version NULL) or a delta from base_version.
    await q(`
      CREATE TABLE IF NOT EXISTS "kb_pack_versions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "country" VARCHAR(6) NOT NULL,
        "version" INTEGER NOT NULL,
        "base_version" INTEGER,
        "content_hash" CHAR(64) NOT NULL,
        "etag" VARCHAR(80) NOT NULL,
        "storage_key" VARCHAR(300) NOT NULL,
        "url" VARCHAR(600) NOT NULL,
        "bytes" INTEGER NOT NULL,
        "key_id" VARCHAR(40) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_kb_pack_versions"
      ON "kb_pack_versions" ("country", "version", COALESCE("base_version", -1));
    `);

    // Importer bookkeeping (plan T4.2): source, licence and fetch date of every run.
    await q(`
      CREATE TABLE IF NOT EXISTS "kb_import_runs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "importer" VARCHAR(40) NOT NULL,
        "source_url" VARCHAR(600),
        "licence" VARCHAR(200),
        "fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "rows_written" INTEGER NOT NULL DEFAULT 0,
        "status" VARCHAR(10) NOT NULL DEFAULT 'running' CHECK ("status" IN ('running', 'succeeded', 'failed')),
        "error" TEXT,
        "finished_at" TIMESTAMP WITH TIME ZONE
      );
    `);
    await q(`CREATE INDEX IF NOT EXISTS "idx_kb_import_runs_importer" ON "kb_import_runs" ("importer", "fetched_at" DESC);`);
  },

  async down(queryInterface) {
    for (const table of [
      'kb_import_runs',
      'kb_pack_versions',
      'kb_kill_switches',
      'kb_payment_rails',
      'kb_currencies',
      'kb_mcc_categories',
      'kb_merchant_aliases',
      'kb_merchants',
      'kb_category_taxonomy',
      'kb_templates',
      'kb_lexicons',
      'kb_institution_senders',
      'kb_institutions',
    ]) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    }
  },
};
