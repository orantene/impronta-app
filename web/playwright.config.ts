/**
 * Playwright config — used by `npm run test:e2e` once Playwright is installed.
 *
 * Install:
 *   cd web
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npx playwright test
 *
 * Defaults to the local-host-proxy host so the middleware host resolution
 * matches what we ship to production (`app.tulala.digital` → `app.local`).
 *
 * Override the base URL when QAing a deployed environment:
 *   PLAYWRIGHT_BASE_URL=https://staging.tulala.digital npx playwright test
 */

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://app.local:3102";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
