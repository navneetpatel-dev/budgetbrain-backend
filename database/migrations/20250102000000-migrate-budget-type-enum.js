'use strict';

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    const tableExists = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'budgets'
       ) AS exists`,
      { type: QueryTypes.SELECT }
    );
    if (!tableExists[0] || !tableExists[0].exists) return;

    const enumName = 'enum_budgets_type';
    const exists = await sequelize.query(
      `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = :enumName) AS exists`,
      { replacements: { enumName }, type: QueryTypes.SELECT }
    );
    if (!exists[0] || !exists[0].exists) return;

    const labels = await sequelize.query(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = :enumName`,
      { replacements: { enumName }, type: QueryTypes.SELECT }
    );
    const set = new Set(labels.map((l) => l.enumlabel));
    if (set.has('custom') && !set.has('category')) {
      return;
    }

    await sequelize.query(`UPDATE budgets SET type = 'monthly' WHERE type::text = 'category'`);
    await sequelize.query(`
      ALTER TABLE budgets ALTER COLUMN type DROP DEFAULT;
      ALTER TABLE budgets ALTER COLUMN type TYPE TEXT USING type::text;
      DROP TYPE IF EXISTS "${enumName}";
      CREATE TYPE "${enumName}" AS ENUM ('monthly', 'weekly', 'custom');
      ALTER TABLE budgets
        ALTER COLUMN type TYPE "${enumName}"
        USING type::"${enumName}";
    `);
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    const enumName = 'enum_budgets_type';
    try {
      await sequelize.query(`
        ALTER TABLE budgets ALTER COLUMN type DROP DEFAULT;
        ALTER TABLE budgets ALTER COLUMN type TYPE TEXT USING type::text;
        DROP TYPE IF EXISTS "${enumName}";
        CREATE TYPE "${enumName}" AS ENUM ('category', 'total');
        ALTER TABLE budgets
          ALTER COLUMN type TYPE "${enumName}"
          USING type::"${enumName}";
      `);
    } catch {}
  },
};
