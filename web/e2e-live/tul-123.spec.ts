/**
 * TUL-123 (A-04): the booking form uses Cloudflare Turnstile, not the hCaptcha
 * puzzle. Look only: opens the booking sheet up to the details step, never submits.
 * Passes only after PR #2606 deploys AND the Turnstile key is saved on the Tulala workspace.
 */
import { expect, test } from "@playwright/test";
import { QA_TALENT_SITE, evidence } from "./_live";

// Catches (old failure): the booking sheet loaded hcaptcha.com and showed the hCaptcha image-puzzle
// frame. Fails on any hcaptcha request, any visible captcha iframe with a non-zero box, or no Turnstile.
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
  const frames = page.locator('iframe[src*="hcaptcha"], iframe[title*="captcha" i]');
  const visibleBoxes: { src: string | null; w: number; h: number }[] = [];
  for (let i = 0; i < (await frames.count()); i++) {
    const f = frames.nth(i);
    const b = await f.boundingBox();
    if ((await f.isVisible()) && b && b.width > 0 && b.height > 0) {
      visibleBoxes.push({ src: await f.getAttribute("src"), w: b.width, h: b.height });
    }
  }
  expect(visibleBoxes, "no visible captcha puzzle frame").toEqual([]);
  await evidence(page, info, "booking-captcha");
});
