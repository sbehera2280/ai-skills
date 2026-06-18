import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config tuned for testing a LIVE EXTERNAL site (a marketing/CMS site we
 * do not host). baseURL is env-driven so the same suite runs against prod (read-only)
 * or a staging URL. NO `webServer` block — the target is remote.
 */
const BASE_URL = process.env.BASE_URL ?? '{{BASE_URL}}';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 4 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: false,
  },
  // Responsive matrix: every spec runs on all three viewports. All Chromium-based, so
  // only the chromium browser binary is needed (no WebKit/Firefox install).
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['Galaxy Tab S4'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
