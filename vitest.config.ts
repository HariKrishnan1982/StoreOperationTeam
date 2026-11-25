import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'node-sqlite-external',
      resolveId(id) {
        if (id === 'node:sqlite' || id === 'sqlite') {
          return { id: 'node:sqlite', external: true };
        }
      },
    },
  ],
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
