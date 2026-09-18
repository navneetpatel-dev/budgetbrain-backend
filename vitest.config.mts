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
    setupFiles: ['./src/testHelpers/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
