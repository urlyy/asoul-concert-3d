import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4173/tour/',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --base /tour/',
    url: 'http://127.0.0.1:4173/tour/',
    reuseExistingServer: false
  }
});
