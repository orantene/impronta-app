import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("MSG-P8 projects mode can open Messages", async ({ page }) => {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page);
  await page.goto("/admin/pos?view=messages");
  await expect(page.getByText(/inbox|messages/i).first()).toBeVisible({ timeout: 15_000 });
});
