'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `ALTER TABLE "budget_alerts" ADD COLUMN IF NOT EXISTS period_start DATE`
    );
    await sequelize.query(`
      UPDATE "budget_alerts"
      SET period_start = DATE(triggered_at)
      WHERE period_start IS NULL
    `);
    await sequelize.query(`
      ALTER TABLE "budget_alerts"
      ALTER COLUMN period_start SET DEFAULT CURRENT_DATE
    `);
    await sequelize.query(`
      ALTER TABLE "budget_alerts"
      ALTER COLUMN period_start SET NOT NULL
    `);
    await sequelize.query(`
      DELETE FROM budget_alerts a
      USING budget_alerts b
      WHERE a.budget_id = b.budget_id
        AND a.user_id = b.user_id
        AND a.threshold = b.threshold
        AND a.period_start = b.period_start
        AND a.id <> b.id
        AND a.triggered_at <= b.triggered_at
        AND (a.triggered_at < b.triggered_at OR a.id < b.id)
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS budget_alerts_dedup_idx
      ON "budget_alerts" (budget_id, user_id, threshold, period_start)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`DROP INDEX IF EXISTS budget_alerts_dedup_idx`)
      .catch(() => {});
    await queryInterface.sequelize
      .query(`ALTER TABLE "budget_alerts" DROP COLUMN IF EXISTS period_start`)
      .catch(() => {});
  },
};
