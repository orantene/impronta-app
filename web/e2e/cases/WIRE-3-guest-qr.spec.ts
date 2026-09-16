/**
 * 3.6 Guest QR: the bill screen (Q05) and the closed-visit refusal.
 * Refusal: closed visit → visit_closed.
 *
 * SEEDED: an open visit. `/visit/<token>/bill` shows the bill; once the
 * floor closes the visit the same URL answers with the engine's sentence.
 * Browse/add/submit stays on `WIRE-3-guest-qr` ordering with the menu
 * fixture and is asserted in `C07-bar`.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";
import { seedVisit } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-3.6 /visit/<token>/bill shows the bill, then refuses once the visit is closed", async ({ page }) => {
  test.setTimeout(240_000);
  const visit = await seedVisit();
  try {
    await prepareJourneysPage(page);
    await page.goto(`/visit/${visit.token}/bill`);
    await expect(page.locator("[data-visit-screen='bill'] [data-visit-bill]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /pay my share/i })).toHaveAttribute("href", `/visit/${visit.token}/share`);

    await visit.close();
    await page.goto(`/visit/${visit.token}/bill`);
    await assertEnglishRefusal(page, WIRE_SENTENCE.visitClosed);
    await expect(page.locator("[data-visit-bill]")).toHaveCount(0);
  } finally {
    await visit.cleanup();
  }
});
