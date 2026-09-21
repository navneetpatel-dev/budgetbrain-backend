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
    if (!(await columnExists(sequelize, 'subscriptions', 'revenuecat_app_user_id'))) return;

    await queryInterface.removeIndex('subscriptions', ['revenuecat_app_user_id']).catch(() => {});
    await queryInterface.removeColumn('subscriptions', 'revenuecat_app_user_id');
    await queryInterface.changeColumn('subscriptions', 'store', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'razorpay',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('subscriptions', 'revenuecat_app_user_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addIndex('subscriptions', ['revenuecat_app_user_id']);
    await queryInterface.changeColumn('subscriptions', 'store', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'app_store',
    });
  },
};
