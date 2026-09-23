/**
 * A free or Pro talent tells the visitor she confirms by hand.
 * Fails when that sentence is missing from her services.
 * Set QA_TALENT_PROFILE_URL to a non-Portfolio QA profile. A missing URL fails the spec.
 */
import { expect, test } from "@playwright/test";

import { assertQaIsolatedTarget } from "../_harness";

const PROFILE = process.env.QA_TALENT_PROFILE_URL ?? "";

test("a free plan says she confirms by hand", async ({ page }) => {
  assertQaIsolatedTarget(PROFILE || "https://staging-qa-journeys.tulala.digital");
  expect(PROFILE, "QA_TALENT_PROFILE_URL is required").not.toEqual("");
  await page.goto(PROFILE, { waitUntil: "domcontentloaded" });
  const note = page.locator("[data-talent-confirms-by-hand]");
  await expect(note.first()).toBeVisible();
  await expect(note.first()).toContainText(/confirms by hand|confirma a mano|confirme à la main/i);
  await page.screenshot({ path: "e2e/qa-program/talent/confirms-by-hand.png", fullPage: false });
});
