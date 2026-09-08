/**
 * C08 [representative] — C08-modelling-or-talent-agency. Browser journey once the fixture exists.
 */
import { test, expect, openWorkspace, openStorefront, prepareJourneysPage, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C08-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C08-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
