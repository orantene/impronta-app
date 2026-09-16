import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, openSendOptions } from "./_wire";

skipUnlessFixture();

test("MSG-P5 resource booking card family is offered from Messages", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?mode=classes&view=messages");
  await assertInboxGroundTruth();
  await page.locator("[data-pos-messages] li button").first().click();
  await openSendOptions(page);
  const sheet = page.locator("[data-pos-sheet='messages-options']");
  // There is no resource family in CARD_KINDS (messaging/types.ts): a room or
  // a chair is booked through the service card and its professional times.
  await expect(sheet.getByText("service card", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText("professional times", { exact: true })).toBeVisible();
});
