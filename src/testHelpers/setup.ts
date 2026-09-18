import 'tsx/cjs';
import { beforeAll } from 'vitest';
import { setupTestDb } from './db';

// Pre-initialize database models for tests
beforeAll(async () => {
  await setupTestDb();
});
