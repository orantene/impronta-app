/**
 * Sanity check that Playwright + Chromium work on this machine.
 * Does not hit the app or agency_domains — useful when Cursor Browser MCP
 * shows "Target page, context or browser has been closed".
 *
 *   cd web && npm run test:e2e:browser-health
 */

import { test, expect } from "@playwright/test";

test("Chromium launches and can load a public page", async ({ page }) => {
  await page.goto("https://example.com/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Example Domain",
  );
});
