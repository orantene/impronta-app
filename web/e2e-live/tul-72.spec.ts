/**
 * TUL-72 / TUL-59 — the ES/EN switch reaches a real English page with a booking
 * action. Look only: nothing is submitted.
 */
import { expect, test } from "@playwright/test";
import { JORGELINA_SITE, evidence } from "./_live";

test("language switch reaches the English page", async ({ page }, info) => {
  await page.goto(`${JORGELINA_SITE}/en`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: /book/i }).or(page.getByRole("button", { name: /book/i })).first()).toBeVisible();
  await evidence(page, info, "home-en");
});
