import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, openSendOptions } from "./_wire";

skipUnlessFixture();

test("MSG-P2 salon: send-options families include services and times", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?mode=counter&view=messages");
  await assertInboxGroundTruth();
  await page.locator("[data-pos-messages] li button").first().click();
  await openSendOptions(page);
  await expect(page.getByText(/service|time|option/i).first()).toBeVisible({ timeout: 15_000 });
});
