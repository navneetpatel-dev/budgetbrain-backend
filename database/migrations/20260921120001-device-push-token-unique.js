'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    // Keep the newest row per push token, drop older duplicates so the unique index can apply.
    await sequelize.query(`
      DELETE FROM devices a
      USING devices b
      WHERE a.push_token IS NOT NULL
        AND a.push_token = b.push_token
        AND a.id <> b.id
        AND a.updated_at < b.updated_at
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS devices_push_token_unique
      ON devices (push_token)
      WHERE push_token IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`DROP INDEX IF EXISTS devices_push_token_unique`)
      .catch(() => {});
  },
};
