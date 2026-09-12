import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth } from "./_wire";

skipUnlessFixture();

test("MSG-P8 projects mode can open Messages", async ({ page }) => {
  await prepareJourneysPage(page);
  // One render, not two: the sign-in lands on the Messages view itself. The
  // counter's own render is 7 to 23 s on a loaded machine and the default
  // `/admin/pos` hop before the real `goto` spent the 30 s budget on Sell.
  await signInJourneysStaff(page, "/admin/pos?view=messages");
  await expect(page.getByText(/inbox|messages/i).first()).toBeVisible({ timeout: 15_000 });
  await assertInboxGroundTruth();
});
