import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, openSendOptions } from "./_wire";

skipUnlessFixture();

test("MSG-P5 resource booking card family is offered from Messages", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?view=messages");
  await assertInboxGroundTruth();
  await page.locator("[data-pos-messages] li button").first().click();
  await openSendOptions(page);
  await expect(page.getByText(/resource|room|space/i).first()).toBeVisible({ timeout: 15_000 });
});
