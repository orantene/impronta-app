/**
 * TUL-119: guest site Majors on the QA talent site (look only; nothing submitted).
 * A-01 /en works + ES/EN switch, A-06 full-screen lightbox with next/back,
 * DS-13 the "¿Te ayudo a elegir?" bubble gets out of the way while scrolling.
 */
import { expect, test } from "@playwright/test";
import { QA_TALENT_SITE, evidence } from "./_live";

test("A-01 /en returns 200 and the home shows an ES / EN switch", async ({ page }, info) => {
  const res = await page.goto(`${QA_TALENT_SITE}/en`, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto(QA_TALENT_SITE, { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href="/en"]').first()).toBeAttached();
  await evidence(page, info, "en-switch");
});

test("A-06 gallery photo opens a full-screen lightbox with next/back and a counter", async ({ page }, info) => {
  await page.goto(QA_TALENT_SITE, { waitUntil: "networkidle" });
  await page.locator("[data-portfolio-shot-link]").first().click();
  const dlg = page.locator("[data-portfolio-lightbox]");
  await expect(dlg).toBeVisible();
  const box = await dlg.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width, "lightbox width").toBeGreaterThanOrEqual(vp.width * 0.9);
  expect(box!.height, "lightbox height").toBeGreaterThanOrEqual(vp.height * 0.9);
  await expect(dlg.locator("[data-portfolio-lightbox-next]")).toBeVisible();
  await expect(dlg.locator("[data-portfolio-lightbox-prev]")).toBeVisible();
  const counter = dlg.locator("[data-portfolio-lightbox-count]");
  await expect(counter).toHaveText(/^1 \/ \d+$/);
  await dlg.locator("[data-portfolio-lightbox-next]").click();
  await expect(counter).toHaveText(/^2 \/ \d+$/);
  await evidence(page, info, "lightbox");
});

test("DS-13 the help bubble hides once the visitor keeps scrolling", async ({ page }, info) => {
  await page.goto(QA_TALENT_SITE, { waitUntil: "networkidle" });
  // mouse.wheel is not supported on mobile WebKit, so scroll the window directly
  // (fires real scroll events on every project, desktop and phone alike).
  const scrollTo = (top: number) =>
    page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
  await scrollTo(700);
  await page.waitForTimeout(1200);
  // Prove the bubble actually showed before asserting it hides.
  await expect(page.locator(".tl-hello")).toBeVisible();
  await evidence(page, info, "bubble-shown");
  await scrollTo(1000);
  await page.waitForTimeout(800);
  await expect(page.locator(".tl-hello")).toBeHidden();
  await evidence(page, info, "scrolled");
});
