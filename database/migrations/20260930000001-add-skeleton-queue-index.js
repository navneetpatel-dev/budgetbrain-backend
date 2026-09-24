'use strict';

/**
 * The admin skeleton queue groups new submissions by shape and counts distinct users
 * (plan T7.4). This index covers that query, so it reads the index only (plan T9.2).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_skeleton_submissions_new_queue"
      ON "detection_skeleton_submissions" ("skeleton_hash", "user_hash") WHERE "status" = 'new'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "idx_skeleton_submissions_new_queue"`);
  },
};
