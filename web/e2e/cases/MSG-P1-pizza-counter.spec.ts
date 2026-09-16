import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth, openMessagesSurface, replyOnFirstThread } from "./_wire";

skipUnlessFixture();

test("MSG-P1 pizza counter: inbox opens and a reply stays on the thread", async ({ page }) => {
  await prepareJourneysPage(page);
  await openMessagesSurface(page, "/admin/pos?mode=counter&view=messages");
  await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible({ timeout: 15_000 });
  await assertInboxGroundTruth();
  const sb = isolatedService();
  const { count: before } = await sb
    .from("inquiry_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  const body = `WIRE-P1 ${Date.now()}`;
  await replyOnFirstThread(page, body);
  const { count: after } = await sb
    .from("inquiry_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect(after ?? 0).toBeGreaterThan(before ?? 0);
});
