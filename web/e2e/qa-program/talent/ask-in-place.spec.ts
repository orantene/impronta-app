/**
 * Ask on a talent site stays on that page and opens the guest dock.
 * Fails when the Ask control or the dock marker is missing.
 * Set QA_TALENT_SITE_URL to the QA vanity host. A missing URL fails the spec.
 */
import { expect, test } from "@playwright/test";

import { assertQaIsolatedTarget } from "../_harness";

const SITE = process.env.QA_TALENT_SITE_URL ?? "";

test("Ask a question opens Messages without leaving the talent site", async ({ page }) => {
  assertQaIsolatedTarget(SITE || "https://staging-qa-journeys.tulala.digital");
  expect(SITE, "QA_TALENT_SITE_URL is required").not.toEqual("");
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  const start = page.url();
  const ask = page.locator('a[href="#talent-ask"], [data-talent-ask]').first();
  await expect(ask).toBeVisible();
  await ask.click();
  await expect(page.locator("[data-guest-chat-launcher]")).toBeVisible();
  expect(page.url().split("?")[0]).toBe(start.split("?")[0]);
  await page.screenshot({ path: "e2e/qa-program/talent/ask-in-place.png", fullPage: false });
});
