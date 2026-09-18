'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    // ALTER TYPE ... ADD VALUE must run as its own statement (cannot be inside a transaction
    // block with other DDL on some PG versions), matching the pattern in
    // 20250103000000-add-additive-columns-and-enums.js.
    try {
      await sequelize.query(`ALTER TYPE enum_family_members_role ADD VALUE IF NOT EXISTS 'admin'`);
    } catch {}
    try {
      await sequelize.query(`ALTER TYPE enum_family_members_role ADD VALUE IF NOT EXISTS 'read_only'`);
    } catch {}
  },

  async down(queryInterface, Sequelize) {
    // PostgreSQL does not support removing a value from an ENUM type. Down-migrating this
    // would require recreating the type and column; left as a no-op like sibling migrations
    // that only add ENUM values.
  },
};
