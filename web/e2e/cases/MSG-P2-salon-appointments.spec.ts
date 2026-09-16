import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, openSendOptions } from "./_wire";

skipUnlessFixture();

test("MSG-P2 salon: send-options families include services and times", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?mode=classes&view=messages");
  await assertInboxGroundTruth();
  await page.locator("[data-pos-messages] li button").first().click();
  await openSendOptions(page);
  const sheet = page.locator("[data-pos-sheet='messages-options']");
  // familiesForMode("classes"): service card, professional times, class card.
  await expect(sheet.getByText("service card", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByText("professional times", { exact: true })).toBeVisible();
});
