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
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await addColumnIfTableExists(
      sequelize,
      'budgets',
      `rollover_mode VARCHAR(20) NOT NULL DEFAULT 'single'`
    );
    await addColumnIfTableExists(sequelize, 'budgets', `rollover_started_at TIMESTAMPTZ NULL`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`ALTER TABLE "budgets" DROP COLUMN IF EXISTS rollover_mode`)
      .catch(() => {});
    await queryInterface.sequelize
      .query(`ALTER TABLE "budgets" DROP COLUMN IF EXISTS rollover_started_at`)
      .catch(() => {});
  },
};
