'use strict';

const { QueryTypes } = require('sequelize');

async function columnExists(sequelize, tableName, columnName) {
  const rows = await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = :tableName AND column_name = :columnName
     ) AS exists`,
    { replacements: { tableName, columnName }, type: QueryTypes.SELECT }
  );
  return Boolean(rows[0]?.exists);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    if (!(await columnExists(sequelize, 'subscriptions', 'razorpay_order_id'))) {
      await queryInterface.addColumn('subscriptions', 'razorpay_order_id', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!(await columnExists(sequelize, 'subscriptions', 'razorpay_subscription_id'))) {
      await queryInterface.addColumn('subscriptions', 'razorpay_subscription_id', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!(await columnExists(sequelize, 'subscriptions', 'razorpay_payment_id'))) {
      await queryInterface.addColumn('subscriptions', 'razorpay_payment_id', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    // revenuecat_app_user_id is RevenueCat-specific; Razorpay-originated rows have none.
    await queryInterface.changeColumn('subscriptions', 'revenuecat_app_user_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface
      .addIndex('subscriptions', ['razorpay_subscription_id'], {
        name: 'subscriptions_razorpay_subscription_id_idx',
      })
      .catch(() => {});
    await queryInterface
      .addIndex('subscriptions', ['razorpay_order_id'], {
        name: 'subscriptions_razorpay_order_id_idx',
      })
      .catch(() => {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('subscriptions', 'razorpay_order_id').catch(() => {});
    await queryInterface.removeColumn('subscriptions', 'razorpay_subscription_id').catch(() => {});
    await queryInterface.removeColumn('subscriptions', 'razorpay_payment_id').catch(() => {});
    await queryInterface.changeColumn('subscriptions', 'revenuecat_app_user_id', {
      type: Sequelize.STRING(255),
      allowNull: false,
    }).catch(() => {});
  },
};
