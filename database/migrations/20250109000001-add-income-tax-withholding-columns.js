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
    await addColumnIfTableExists(sequelize, 'transactions', `tax_withheld DECIMAL(15,2) NULL`);
    await addColumnIfTableExists(sequelize, 'transactions', `net_amount DECIMAL(15,2) NULL`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS tax_withheld`)
      .catch(() => {});
    await queryInterface.sequelize
      .query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS net_amount`)
      .catch(() => {});
  },
};
