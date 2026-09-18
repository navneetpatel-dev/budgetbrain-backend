'use strict';

const { QueryTypes } = require('sequelize');

async function addColumnIfTableExists(sequelize, tableName, columnDef) {
  const rows = await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = :tableName
     ) AS exists`,
    { replacements: { tableName }, type: QueryTypes.SELECT }
  );
  if (rows[0]?.exists) {
    await sequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS ${columnDef}`);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    await addColumnIfTableExists(sequelize, 'transactions', `tags TEXT[] DEFAULT '{}'`);
    await addColumnIfTableExists(sequelize, 'transactions', `recurring_series_id UUID`);
    await addColumnIfTableExists(sequelize, 'budgets', `rollover BOOLEAN DEFAULT false`);
    await addColumnIfTableExists(sequelize, 'users', `weekly_digest_opt_in BOOLEAN DEFAULT true`);

    await addColumnIfTableExists(sequelize, 'audit_logs', `actor_type VARCHAR(20) DEFAULT 'user'`);
    await addColumnIfTableExists(sequelize, 'audit_logs', `outcome VARCHAR(20) DEFAULT 'success'`);
    await addColumnIfTableExists(sequelize, 'audit_logs', `severity VARCHAR(20) DEFAULT 'info'`);
    await addColumnIfTableExists(sequelize, 'audit_logs', `source VARCHAR(20) DEFAULT 'system'`);
    await addColumnIfTableExists(sequelize, 'audit_logs', `request_id VARCHAR(64)`);
    await addColumnIfTableExists(sequelize, 'audit_logs', `before_state JSONB`);
    await addColumnIfTableExists(sequelize, 'audit_logs', `after_state JSONB`);

    // ALTER TYPE ... ADD VALUE must run as its own statement
    try {
      await sequelize.query(`ALTER TYPE enum_parsed_transactions_source ADD VALUE IF NOT EXISTS 'csv'`);
    } catch {}
    try {
      await sequelize.query(`ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'bill_due'`);
    } catch {}
    try {
      await sequelize.query(`ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'weekly_digest'`);
    } catch {}
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    await sequelize.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS tags`).catch(() => {});
    await sequelize.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS recurring_series_id`).catch(() => {});
    await sequelize.query(`ALTER TABLE "budgets" DROP COLUMN IF EXISTS rollover`).catch(() => {});
    await sequelize.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS weekly_digest_opt_in`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS actor_type`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS outcome`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS severity`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS source`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS request_id`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS before_state`).catch(() => {});
    await sequelize.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS after_state`).catch(() => {});
  },
};
