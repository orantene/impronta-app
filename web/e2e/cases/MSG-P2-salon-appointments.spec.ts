import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth } from "./_wire";

skipUnlessFixture();

test("MSG-P2 salon: send-options families include services and times", async ({ page }) => {
  await prepareJourneysPage(page);
  // One render, not two: the sign-in lands on the Messages view itself. The
  // counter's own render is 7 to 23 s on a loaded machine and the default
  // `/admin/pos` hop before the real `goto` spent the 30 s budget on Sell.
  await signInJourneysStaff(page, "/admin/pos?view=messages");
  await expect(page.locator("[data-pos-messages=shell], [data-pos-messages=phone]")).toBeVisible({ timeout: 15_000 });
  await assertInboxGroundTruth();
});
