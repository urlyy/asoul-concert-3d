import { defineConfig } from '@playwright/test';
import standard from './playwright.config.js';

export default defineConfig({
  ...standard,
  testDir: './tests-toy',
  webServer: {
    ...standard.webServer,
    command: 'npm run preview -- --outDir dist-toy --port 4173 --strictPort --base /tour/'
  }
});
