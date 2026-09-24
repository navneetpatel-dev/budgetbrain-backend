'use strict';

/**
 * Per-user switch for automatic detection: when false, every detected transaction waits for
 * review instead of being added automatically (implementation plan tasks T1.5 and T5.7). The
 * server enforces it, so it holds even for an outdated client.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "detection_auto_add" BOOLEAN NOT NULL DEFAULT TRUE;`
    );
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "detection_auto_add";`);
  },
};
