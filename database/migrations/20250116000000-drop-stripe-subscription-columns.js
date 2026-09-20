'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    // Stripe was removed as a payment provider — Razorpay is now the sole web payment
    // gateway alongside RevenueCat (mobile). These columns were added by
    // 20250113000000-add-stripe-subscription-columns.js and are no longer read/written
    // by any code path.
    await sequelize.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS stripe_customer_id`);
    await sequelize.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS stripe_subscription_id`);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;
    await sequelize
      .query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)`)
      .catch(() => {});
    await sequelize
      .query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)`)
      .catch(() => {});
  },
};
