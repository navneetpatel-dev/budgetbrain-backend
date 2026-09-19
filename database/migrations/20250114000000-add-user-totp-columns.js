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

    await addColumnIfTableExists(sequelize, 'users', `totp_secret VARCHAR(255)`);
    await addColumnIfTableExists(sequelize, 'users', `totp_enabled BOOLEAN NOT NULL DEFAULT false`);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS totp_secret`).catch(() => {});
    await sequelize.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS totp_enabled`).catch(() => {});
  },
};
