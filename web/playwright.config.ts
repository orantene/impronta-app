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
 *
 * Use the installed Google Chrome (not bundled Chromium):
 *   PLAYWRIGHT_CHANNEL=chrome npx playwright test
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

/** Load `web/.env.local` into `process.env` so Playwright picks up `TEST_ADMIN_*` without shell exports. */
function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://app.local:3102";

/** Set `PLAYWRIGHT_CHANNEL=chrome` to run against the installed Google Chrome app (not bundled Chromium). */
const useGoogleChrome = process.env.PLAYWRIGHT_CHANNEL === "chrome";

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
      name: useGoogleChrome ? "google-chrome" : "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useGoogleChrome ? { channel: "chrome" as const } : {}),
      },
    },
  ],
});
