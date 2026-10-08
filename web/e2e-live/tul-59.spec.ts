/**
 * TUL-59 — Jorgelina's public booking site, guest P0 items (look only; nothing
 * is submitted). Covers the checks a script can prove: language both ways,
 * nav from policy pages, no platform placeholder, no dead "Reseñas", gallery
 * lightbox, no English nail ticker on the Spanish home.
 */
import { expect, test } from "@playwright/test";
import { JORGELINA_SITE, evidence } from "./_live";

test("P0-1 ES works again after visiting /en", async ({ page }, info) => {
  await page.goto(`${JORGELINA_SITE}/en`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("link", { name: /^ES$/ }).or(page.getByRole("button", { name: /^ES$/ })).first().click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await evidence(page, info, "es-after-en");
});

test("P0-2 policies show real text, never the platform placeholder", async ({ page }, info) => {
  for (const path of ["/politicas", "/privacidad"]) {
    const res = await page.goto(`${JORGELINA_SITE}${path}`, { waitUntil: "domcontentloaded" });
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText(/aún no publicó|Texto general de la plataforma/i);
    await evidence(page, info, path.slice(1));
  }
});

test("P0-5 nav from /politicas leads back to home sections; no Reseñas link", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop nav");
  await page.goto(`${JORGELINA_SITE}/politicas`, { waitUntil: "domcontentloaded" });
  const hrefs = await page.locator("header a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  await info.attach("header-hrefs", { body: JSON.stringify(hrefs), contentType: "application/json" });
  const anchorsOnly = hrefs.filter((h) => h.startsWith("#"));
  expect(anchorsOnly, "header links on /politicas must not be bare #anchors").toEqual([]);
  await expect(page.getByRole("link", { name: /reseñas/i })).toHaveCount(0);
});

// Catches A-06 (old failure): the lightbox rendered inside a 228x334 card with no
// next/back and no counter. The old check only asserted the dialog was visible,
// which that broken build also satisfied. Now: box >= 90% of the viewport, prev/next
// visible, counter "1 / N" moving to "2 / N", Esc closes.
test("P1-10 gallery photo opens a full-screen lightbox with next/back, counter and Esc", async ({ page }, info) => {
  await page.goto(JORGELINA_SITE, { waitUntil: "networkidle" });
  const shots = page.locator("[data-portfolio-shot-link]");
  const gallery = page.locator("#gallery, [data-section='gallery'], section:has-text('Trabajos')").first();
  const shotCount = await shots.count();
  const trigger = shotCount > 0 ? shots.first() : gallery.locator("img").first();
  const total = shotCount > 0 ? shotCount : await gallery.locator("img").count();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.locator("[data-portfolio-lightbox]").first();
  await expect(dialog, "lightbox dialog").toBeVisible();
  await expect(dialog).not.toContainText(/Continuar|Confirmar cita/);
  const vp = page.viewportSize();
  expect(vp, "viewport").not.toBeNull();
  const box = await dialog.boundingBox();
  await info.attach("lightbox-box", { body: JSON.stringify({ vp, box, total }), contentType: "application/json" });
  expect(box, "lightbox has a box").not.toBeNull();
  expect(box!.width, "lightbox width >= 90% viewport").toBeGreaterThanOrEqual(vp!.width * 0.9);
  expect(box!.height, "lightbox height >= 90% viewport").toBeGreaterThanOrEqual(vp!.height * 0.9);
  if (total > 1) {
    const next = dialog.locator("[data-portfolio-lightbox-next]");
    await expect(next, "next button").toBeVisible();
    await expect(dialog.locator("[data-portfolio-lightbox-prev]"), "prev button").toBeVisible();
    const counter = dialog.locator("[data-portfolio-lightbox-count]");
    await expect(counter).toHaveText(/^1 \/ \d+$/);
    await next.click();
    await expect(counter, "next moves the counter to 2").toHaveText(/^2 \/ \d+$/);
  }
  await evidence(page, info, "gallery-lightbox");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-portfolio-lightbox]"), "Esc closes the lightbox").toHaveCount(0);
});

test("P1-9 Spanish home has no English nail-product ticker", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "content check");
  await page.goto(JORGELINA_SITE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(/Semi-permanent gel\s*✦\s*Soft Gel/);
});
