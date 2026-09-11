import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("MSG-P2 salon: send-options families include services and times", async ({ page }) => {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page);
  await page.goto("/admin/pos?view=messages");
  await expect(page.locator("[data-pos-messages=shell], [data-pos-messages=phone]")).toBeVisible({ timeout: 15_000 });
});
