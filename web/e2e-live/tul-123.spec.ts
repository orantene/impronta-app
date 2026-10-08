/**
 * TUL-123 (A-04): the booking form uses Cloudflare Turnstile, not the hCaptcha
 * puzzle. Look only: opens the booking sheet up to the details step, never submits.
 * Passes only after PR #2606 deploys AND the Turnstile key is saved on the Tulala workspace.
 */
import { expect, test } from "@playwright/test";
import { QA_TALENT_SITE, evidence } from "./_live";

test("booking page loads Turnstile and no hCaptcha", async ({ page }, info) => {
  const vendors: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("hcaptcha.com")) vendors.push("hcaptcha");
    if (u.includes("challenges.cloudflare.com")) vendors.push("turnstile");
  });
  await page.goto(QA_TALENT_SITE, { waitUntil: "networkidle" });
  // Open the first bookable service; the sheet preloads the captcha script.
  await page.getByRole("button", { name: /^Seleccionar$/ }).first().click();
  await page.waitForTimeout(4000);
  await info.attach("captcha-vendors", { body: JSON.stringify(vendors), contentType: "application/json" });
  expect(vendors, "no hCaptcha requests").not.toContain("hcaptcha");
  expect(vendors, "Turnstile loaded").toContain("turnstile");
  await expect(page.frameLocator('iframe[src*="hcaptcha.com"]').locator("body")).toHaveCount(0);
  await evidence(page, info, "booking-captcha");
});
