import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5177/',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5177',
    url: 'http://127.0.0.1:5177/',
    reuseExistingServer: false,
    // e2e рассчитаны на MockApiClient — .env.local не должен сюда протекать.
    env: {
      VITE_USE_MOCK_API: 'true',
      VITE_MOCK_LOGIN: 'false',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
