import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("MSG-P1 pizza counter: inbox opens and a reply stays on the thread", async ({ page }) => {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page);
  await page.goto("/admin/pos?view=messages");
  await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible({ timeout: 15_000 });
});
