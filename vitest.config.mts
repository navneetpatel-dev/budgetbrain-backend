import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@database': path.resolve(__dirname, './database'),
      '@core': path.resolve(__dirname, './src/core'),
      '@config': path.resolve(__dirname, './src/config'),
      '@jobs': path.resolve(__dirname, './src/jobs'),
      '@modules': path.resolve(__dirname, './src/shared/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@testHelpers': path.resolve(__dirname, './src/testHelpers/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./src/testHelpers/envSetup.ts', './src/testHelpers/setup.ts'],
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-ci-not-a-real-key',
      JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET || 'test_access_secret_32_characters_minimum!',
      JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_32_characters_minimum!',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
