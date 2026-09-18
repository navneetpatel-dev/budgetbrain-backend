'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'subscriptions'
       ) AS exists`,
      { type: queryInterface.sequelize.constructor.QueryTypes.SELECT }
    );

    if (tableExists[0]?.exists) {
      const colExists = await queryInterface.sequelize.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'entitlement_id'
         ) AS exists`,
        { type: queryInterface.sequelize.constructor.QueryTypes.SELECT }
      );
      if (!colExists[0]?.exists) {
        await queryInterface.dropTable('subscriptions', { cascade: true });
      } else {
        return;
      }
    }


    await queryInterface.createTable('subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      revenuecat_app_user_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      product_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      entitlement_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        defaultValue: 'pro',
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'active',
      },
      plan: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      current_period_start: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      current_period_end: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      store: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'app_store',
      },
      is_lifetime: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      original_purchase_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      unsubscribe_detected_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      billing_issues_detected_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('subscriptions', ['user_id', 'entitlement_id'], {
      unique: true,
      name: 'subscriptions_user_entitlement_unique',
    });

    await queryInterface.addIndex('subscriptions', ['status'], {
      name: 'subscriptions_status_idx',
    });

    await queryInterface.addIndex('subscriptions', ['revenuecat_app_user_id'], {
      name: 'subscriptions_rc_app_user_id_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('subscriptions', { cascade: true }).catch(() => {});
  },
};
