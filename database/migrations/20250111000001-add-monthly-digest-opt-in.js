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
    await addColumnIfTableExists(sequelize, 'users', `monthly_digest_opt_in BOOLEAN DEFAULT false`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`ALTER TABLE "users" DROP COLUMN IF EXISTS monthly_digest_opt_in`)
      .catch(() => {});
  },
};
