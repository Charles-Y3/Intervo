import { defineConfig, devices } from '@playwright/test';

// Runs against the PRODUCTION build served by `vite preview`, not the dev server.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4175',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
