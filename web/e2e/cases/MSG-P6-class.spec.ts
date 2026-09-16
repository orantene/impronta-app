import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, openSendOptions } from "./_wire";

skipUnlessFixture();

test("MSG-P6 class card family is offered from Messages", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?mode=classes&view=messages");
  await assertInboxGroundTruth();
  await page.locator("[data-pos-messages] li button").first().click();
  await openSendOptions(page);
  const sheet = page.locator("[data-pos-sheet='messages-options']");
  await expect(sheet.getByText("class card", { exact: true })).toBeVisible({ timeout: 15_000 });
});
