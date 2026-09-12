import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface } from "./_wire";

skipUnlessFixture();

test("MSG-P11 recovery refusals stay codes on the Messages surface", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?view=messages");
  await assertInboxGroundTruth();
  await page.reload();
  await expect(page.locator("[data-pos-messages=shell], [data-pos-messages=phone]").first()).toBeVisible({
    timeout: 20_000,
  });
  const refusal = page.locator("[data-pos-refusal]");
  if ((await refusal.count()) > 0) {
    await expect(refusal.first()).not.toHaveText(/_/);
  }
});
