/**
 * Live checks — read-only Playwright specs that prove a Work board ticket on
 * PRODUCTION after a deploy (Notion: EPIC 0, "Live-check scripts").
 *
 *   npm run live:check                 # every live check
 *   npm run live:check -- tul-95 tul-98   # only those tickets (file-name match)
 *
 * Rules (see Wiki > Work board operating manual):
 *   - One spec per ticket: `e2e-live/tul-<id>.spec.ts`, named after its TUL id.
 *   - Read-only. Never write on Jorgelina's real account (TAL-93938). Specs that
 *     need a session use the test talent TAL-93900 via LIVE_STORAGE_STATE and
 *     skip when it is not set (create it with `npm run live:login`).
 *   - Screenshots of every check land in `qa-evidence/live/<date>/`, so the
 *     board owner attaches proof without opening a browser.
 *
 * Lives outside `e2e/` on purpose: the main config collects every spec under
 * `e2e/`, and these must never run against localhost or in the CI gate.
 */

import { defineConfig, devices } from "@playwright/test";

const day = new Date().toISOString().slice(0, 10);
const storageState = process.env.LIVE_STORAGE_STATE || undefined;

export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: true,
  // Light on the shared machine: production is the slow side, not the CPU.
  workers: 2,
  retries: 1,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: `qa-evidence/live/${day}/artifacts`,
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? "https://tulala.digital",
    screenshot: "on",
    trace: "retain-on-failure",
    ...(storageState ? { storageState } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone-390", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
  ],
});
