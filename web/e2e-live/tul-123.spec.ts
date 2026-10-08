/**
 * TUL-123 (A-04): the booking form never shows the hCaptcha image puzzle. Decision 2026-10-07: captcha
 * is OFF (HQ switch `guest_captcha_enforced`), Turnstile ships dark; if a Turnstile key is saved and the
 * switch is turned on, Turnstile (mostly invisible) may load, never hCaptcha. Look only: opens the
 * booking sheet up to the details step, never submits.
 */
import { expect, test } from "@playwright/test";
import { QA_TALENT_SITE, evidence } from "./_live";

// Catches (old failure): the booking sheet loaded hcaptcha.com and showed the hCaptcha image-puzzle
// frame. Fails on any hcaptcha request or any visible captcha iframe with a non-zero box. Turnstile is
// NOT required (captcha is off by decision); it is recorded in the attachment for the evidence trail.
test("booking page never loads hCaptcha or shows a captcha puzzle", async ({ page }, info) => {
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
