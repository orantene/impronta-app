/**
 * Paid QA on the ISOLATED stack only (Notion TUL-464).
 *
 *   npm run qa:paid-isolated
 *
 * Runs against a LOCAL build pointed at the isolated Supabase project (fxlank),
 * with Stripe TEST keys and the Stripe test listeners running. Never in the CI gate
 * and never against production: `e2e-isolated/global-setup.ts` refuses first.
 *
 * Lives outside `e2e/` and `e2e-live/` on purpose: neither of those configs may
 * ever collect it.
 */
import { defineConfig, devices } from "@playwright/test";

const day = new Date().toISOString().slice(0, 10);

export default defineConfig({
  testDir: "./e2e-isolated",
  testMatch: /paid-qa(-after-pay)?\.spec\.ts/,
  globalSetup: "./e2e-isolated/global-setup.ts",
  globalTeardown: "./e2e-isolated/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"], ["json", { outputFile: `docs/plans/qa-evidence/paid-qa-${day}/results.json` }]],
  outputDir: `docs/plans/qa-evidence/paid-qa-${day}/artifacts`,
  use: {
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [{ name: "isolated-desktop", use: { ...devices["Desktop Chrome"] } }],
});
