/**
 * Live-QA regression pack on the ISOLATED stack only (replaces hand-run Live QA).
 *
 *   npm run qa:live-pack
 *
 * One test per Notion card id (the TUL number is in each test title). Refuses to
 * start unless the Supabase target is the isolated project and every origin is
 * local (`e2e-isolated/live-qa-pack-setup.ts`). Lives outside `e2e/` and
 * `e2e-live/` on purpose: neither of those configs may ever collect it, and it
 * is never part of the CI gate.
 *
 * Evidence (a screenshot per test + results.json) lands in
 * `docs/plans/qa-evidence/live-qa-pack-<date>/`.
 */
import { defineConfig, devices } from "@playwright/test";

const day = new Date().toISOString().slice(0, 10);

export default defineConfig({
  testDir: "./e2e-isolated",
  testMatch: /live-qa-pack\.spec\.ts/,
  globalSetup: "./e2e-isolated/live-qa-pack-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [["list"], ["json", { outputFile: `docs/plans/qa-evidence/live-qa-pack-${day}/results.json` }]],
  outputDir: `docs/plans/qa-evidence/live-qa-pack-${day}/artifacts`,
  use: {
    screenshot: "on",
    trace: "retain-on-failure",
    launchOptions: { args: ["--host-resolver-rules=MAP *.tulala.digital 127.0.0.1"] },
  },
  projects: [{ name: "isolated-desktop", use: { ...devices["Desktop Chrome"] } }],
});
