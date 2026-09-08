/**
 * C28 [delta] — C28-eyelash-business-with-five-workers. Browser journey once the fixture exists.
 */
import { test, expect, openWorkspace, openStorefront, prepareJourneysPage, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C28-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C28-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
