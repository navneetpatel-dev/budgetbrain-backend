'use strict';

/**
 * Staged rollout of automatic detection (plan T9.3): per country, which share of users get it.
 * `country = ''` is the default for users whose country has no row. With no rows at all,
 * everyone has it, as before this table existed.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "detection_rollout" (
        "country" VARCHAR(2) PRIMARY KEY CHECK ("country" = '' OR "country" ~ '^[A-Z]{2}$'),
        "percent" SMALLINT NOT NULL CHECK ("percent" BETWEEN 0 AND 100),
        "include_internal" BOOLEAN NOT NULL DEFAULT TRUE,
        "note" TEXT,
        "updated_by" UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "detection_rollout"`);
  },
};
