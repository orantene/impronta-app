import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface } from "./_wire";

skipUnlessFixture();

test("MSG-P8 projects mode can open Messages", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?mode=projects&view=messages");
  await expect(page).toHaveURL(/mode=projects/);
  await expect(page.getByText(/inbox|messages/i).first()).toBeVisible({ timeout: 15_000 });
  await assertInboxGroundTruth();
});
