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
    await addColumnIfTableExists(sequelize, 'transaction_attachments', 'extracted_data JSONB NULL');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize
      .query('ALTER TABLE "transaction_attachments" DROP COLUMN IF EXISTS extracted_data')
      .catch(() => {});
  },
};
