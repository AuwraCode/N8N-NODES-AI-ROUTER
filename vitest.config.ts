import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['nodes/**/*.ts', 'credentials/**/*.ts'],
      exclude: ['dist/**/*', 'test/**/*'],
    },
  },
  resolve: {
    alias: {},
  },
});
