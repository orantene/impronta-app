import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("MSG-P11 recovery refusals stay codes on the Messages surface", async ({ page }) => {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page);
  await page.goto("/admin/pos?view=messages");
  await expect(page.locator("[data-pos-refusal]")).toHaveCount(0);
});
