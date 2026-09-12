import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, replyOnFirstThread } from "./_wire";

skipUnlessFixture();

test("MSG-P12 concurrent edit keeps one Messages shell", async ({ page, context }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?view=messages");
  await expect(page.locator("[data-pos-messages=shell], [data-pos-messages=phone]")).toHaveCount(1, {
    timeout: 15_000,
  });
  await assertInboxGroundTruth();
  const other = await context.newPage();
  await openMessagesSurface(other, "/admin/pos?view=messages");
  await expect(other.locator("[data-pos-messages=shell], [data-pos-messages=phone]")).toHaveCount(1);
  const marker = `WIRE-P12 ${Date.now()}`;
  await replyOnFirstThread(page, marker);
  await other.reload();
  await expect(other.getByText(marker).first()).toBeVisible({ timeout: 20_000 });
  await other.close();
});
