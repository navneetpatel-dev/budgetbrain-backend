import { sequelize, initModels } from '@database/models';

let isInitialized = false;

export async function setupTestDb() {
  if (!isInitialized) {
    initModels(sequelize);
    isInitialized = true;
  }
  await sequelize.authenticate();
  return sequelize;
}

export async function teardownTestDb() {
  // If needed to close connection after tests
}
