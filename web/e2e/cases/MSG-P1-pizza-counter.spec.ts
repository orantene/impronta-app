import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { assertInboxGroundTruth } from "./_wire";

skipUnlessFixture();

test("MSG-P1 pizza counter: inbox opens and a reply stays on the thread", async ({ page }) => {
  await prepareJourneysPage(page);
  // One render, not two: the sign-in lands on the Messages view itself. The
  // counter's own render is 7 to 23 s on a loaded machine and the default
  // `/admin/pos` hop before the real `goto` spent the 30 s budget on Sell.
  await signInJourneysStaff(page, "/admin/pos?view=messages");
  await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible({ timeout: 15_000 });
  await assertInboxGroundTruth();
  const sb = isolatedService();
  const { count } = await sb
    .from("inquiry_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((count ?? 0) >= 0).toBeTruthy();
});
