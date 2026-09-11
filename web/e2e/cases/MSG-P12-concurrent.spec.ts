import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("MSG-P12 concurrent edit keeps one Messages shell", async ({ page }) => {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page);
  await page.goto("/admin/pos?view=messages");
  await expect(page.locator("[data-pos-messages=shell], [data-pos-messages=phone]")).toHaveCount(1);
});
