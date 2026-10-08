/**
 * TUL-118 (DS-64, E-12): a fresh talent site never shows visitors empty bands or
 * owner-facing hints. Look only, on the QA fresh site (TAL-93944, no services or photos).
 */
import { expect, test } from "@playwright/test";
import { evidence } from "./_live";

const FRESH_SITE = "https://qa-fresh-studio.tulala.digital";

// Catches (old failure): a fresh site rendered "Aún no hay servicios publicados" / "No services are
// published yet", the owner hint "No photos in your portfolio yet" / "Todavía no hay fotos", and a
// FAQ block (accordion) with zero questions under it. Checked in ES and EN.
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
    // A FAQ block (the accordion node, bound or authored) must have at least one question. Selected by
    // block class, not by heading text: Maison v2's heading reads "Lo que me preguntan" / "What I get
    // asked" and is not inside a <section>, so a heading regex passed vacuously. An ABSENT block is the
    // correct state for a talent with no questions; an accordion root with zero items is the bug.
    const bands = await page.locator(".site-builder-node--accordion").evaluateAll((els) =>
      els.map((el) => ({
        id: el.id,
        bound: el.getAttribute("data-faq-bind"),
        items: el.querySelectorAll(".site-builder-node--accordion-item").length,
      })),
    );
    await info.attach(`faq-bands${path === "/" ? "-es" : "-en"}`, {
      body: JSON.stringify(bands),
      contentType: "application/json",
    });
    for (const b of bands) expect(b.items, `${path} FAQ block #${b.id} (${b.bound ?? "authored"}) has no questions`).toBeGreaterThan(0);
    await evidence(page, info, path === "/" ? "es" : "en");
  }
});
