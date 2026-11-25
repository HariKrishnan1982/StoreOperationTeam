import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3002',
    headless: true,
  },
  webServer: {
    command: 'npx tsx src/server/db/seed.ts --reset && node dist/server/index.js',
    url: 'http://localhost:3002/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3002',
      DATABASE_PATH: './data/e2e_test.db',
      CORS_ORIGINS: 'http://localhost:3002',
      LOGIN_RATE_LIMIT_MAX: '100',
    },
  },
});
