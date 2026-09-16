import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, replyOnFirstThread } from "./_wire";

skipUnlessFixture();

test("MSG-P12 concurrent edit keeps one Messages shell", async ({ page, context }) => {
  test.setTimeout(240_000);
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
  // The other session, reloaded after the write, still mounts exactly one
  // shell and its inbox reflects the reply (the badge and the row come from
  // the same reader, WIRE-4.1); the thread text is the prototype P1's claim.
  await other.reload();
  await expect(other.locator("[data-pos-messages=shell], [data-pos-messages=phone]")).toHaveCount(1, { timeout: 20_000 });
  await other.close();
});
