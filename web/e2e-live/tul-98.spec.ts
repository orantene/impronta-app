/**
 * TUL-98 — a Spanish-primary talent site must tell search engines its home is
 * Spanish: hreflang="es" points at the root, the root is never tagged "en",
 * and <html lang> is "es".
 */
import { expect, test } from "@playwright/test";
import { JORGELINA_SITE } from "./_live";

test("Spanish home is declared Spanish in hreflang and html lang", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "head tags are viewport-independent");
  await page.goto(JORGELINA_SITE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const alternates = await page
    .locator('link[rel="alternate"][hreflang]')
    .evaluateAll((els) => els.map((e) => [e.getAttribute("hreflang"), e.getAttribute("href")]));
  await info.attach("hreflang", { body: JSON.stringify(alternates, null, 2), contentType: "application/json" });
  const root = JORGELINA_SITE.replace(/\/$/, "");
  const atRoot = alternates.filter(([, href]) => href?.replace(/\/$/, "") === root).map(([l]) => l);
  expect(atRoot, "the root URL must be the Spanish alternate").toContain("es");
  expect(atRoot, "the root URL must not be tagged English").not.toContain("en");
});
