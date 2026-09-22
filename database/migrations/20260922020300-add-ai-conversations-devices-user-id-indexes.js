'use strict';

// Neither ai_conversations nor devices had an index on user_id (devices only had a
// unique index on push_token) — both are read on every AI-history load and every
// push-notification fan-out, so both were sequential-scanning on their most common query.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx ON "ai_conversations" (user_id)`
    );
    await sequelize.query(`CREATE INDEX IF NOT EXISTS devices_user_id_idx ON "devices" (user_id)`);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DROP INDEX IF EXISTS ai_conversations_user_id_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS devices_user_id_idx`).catch(() => {});
  },
};
