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
      'recurring_series',
      `goal_id UUID NULL REFERENCES goals(id) ON DELETE SET NULL`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`ALTER TABLE "recurring_series" DROP COLUMN IF EXISTS goal_id`)
      .catch(() => {});
  },
};
