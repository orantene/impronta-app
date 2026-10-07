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

test("P1-10 gallery photo opens a lightbox, not the booking window", async ({ page }, info) => {
  await page.goto(JORGELINA_SITE, { waitUntil: "networkidle" });
  const gallery = page.locator("#gallery, [data-section='gallery'], section:has-text('Trabajos')").first();
  await gallery.scrollIntoViewIfNeeded();
  await gallery.locator("img").first().click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await expect(page.getByRole("dialog").first()).not.toContainText(/Continuar|Confirmar cita/);
  await evidence(page, info, "gallery-lightbox");
});

test("P1-9 Spanish home has no English nail-product ticker", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "content check");
  await page.goto(JORGELINA_SITE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toContainText(/Semi-permanent gel ✦|✦ Soft Gel/);
});
