/**
 * /talent/inbox mounts Messages v5. Fails when the marker is missing.
 * Set QA_TALENT_INBOX_URL to a signed-in talent inbox on the QA host.
 * A missing URL fails the spec.
 */
import { expect, test } from "@playwright/test";

import { assertQaIsolatedTarget } from "../_harness";

const INBOX = process.env.QA_TALENT_INBOX_URL ?? "";

test("her Messages inbox is Messages v5", async ({ page }) => {
  assertQaIsolatedTarget(INBOX || "https://staging-qa-journeys.tulala.digital");
  expect(INBOX, "QA_TALENT_INBOX_URL is required").not.toEqual("");
  await page.goto(INBOX, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-talent-messages-v5]")).toBeVisible();
  await page.screenshot({ path: "e2e/qa-program/talent/talent-inbox-v5.png", fullPage: false });
});
