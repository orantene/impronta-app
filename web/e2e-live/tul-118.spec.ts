/**
 * TUL-118 (DS-64, E-12): a fresh talent site never shows visitors empty bands or
 * owner-facing hints. Look only, on the QA fresh site (TAL-93944, no services or photos).
 */
import { expect, test } from "@playwright/test";
import { evidence } from "./_live";

const FRESH_SITE = "https://qa-fresh-studio.tulala.digital";

test("no empty services, gallery or FAQ bands for visitors (ES + EN)", async ({ page }, info) => {
  for (const path of ["/", "/en"]) {
    const res = await page.goto(`${FRESH_SITE}${path}`, { waitUntil: "networkidle" });
    expect(res?.status(), path).toBe(200);
    const body = page.locator("body");
    await expect(body, path).not.toContainText(/Aún no hay servicios publicados|Todavía no hay servicios publicados|No services are published yet/);
    await expect(body, path).not.toContainText(/No photos in your portfolio yet|Aún no hay fotos en tu portafolio/);
    await evidence(page, info, path === "/" ? "es" : "en");
  }
});
