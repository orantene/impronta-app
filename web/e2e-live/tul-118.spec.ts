/**
 * TUL-118 (DS-64, E-12): a fresh talent site never shows visitors empty bands or
 * owner-facing hints. Look only, on the QA fresh site (TAL-93944, no services or photos).
 */
import { expect, test } from "@playwright/test";
import { evidence } from "./_live";

const FRESH_SITE = "https://qa-fresh-studio.tulala.digital";

// Catches (old failure): a fresh site rendered "Aún no hay servicios publicados" / "No services are
// published yet", the owner hint "No photos in your portfolio yet" / "Todavía no hay fotos", and a
// "Preguntas" FAQ heading with zero questions under it. Checked in ES and EN.
test("no empty services, gallery or FAQ bands for visitors (ES + EN)", async ({ page }, info) => {
  for (const path of ["/", "/en"]) {
    const res = await page.goto(`${FRESH_SITE}${path}`, { waitUntil: "networkidle" });
    expect(res?.status(), path).toBe(200);
    const body = page.locator("body");
    await expect(body, `${path} services empty text`).not.toContainText(
      /Aún no hay servicios|Todavía no hay servicios|No services are published yet|No services yet/i,
    );
    await expect(body, `${path} photos empty text`).not.toContainText(
      /No photos in your portfolio yet|Aún no hay fotos|Todavía no hay fotos|No photos yet/i,
    );
    // A FAQ heading must have at least one question under it.
    const bands = await page
      .locator("section")
      .filter({
        has: page.locator("h1, h2, h3").filter({ hasText: /^\s*(Preguntas( frecuentes)?|FAQ|Frequently asked questions)\s*$/i }),
      })
      .evaluateAll((els) =>
        els.map((el) => ({
          id: el.id,
          items: el.querySelectorAll("details, summary, [data-faq-bind] > *, dt").length,
        })),
      );
    await info.attach(`faq-bands${path === "/" ? "-es" : "-en"}`, {
      body: JSON.stringify(bands),
      contentType: "application/json",
    });
    for (const b of bands) expect(b.items, `${path} FAQ band #${b.id} has no questions`).toBeGreaterThan(0);
    await evidence(page, info, path === "/" ? "es" : "en");
  }
});
