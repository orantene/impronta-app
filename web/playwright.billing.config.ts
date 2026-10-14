/**
 * Billing E2E regression suite (TUL-838). Runs against STAGING, Stripe TEST
 * mode only. Lives outside `e2e/` so the main config and the CI gate never
 * collect it.
 *
 *   BILLING_BASE_URL=https://pay.staging.tulala.digital \
 *     npx playwright test -c playwright.billing.config.ts
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-billing",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-billing" }]],
  use: {
    baseURL: process.env.BILLING_BASE_URL ?? "https://pay.staging.tulala.digital",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : {},
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
