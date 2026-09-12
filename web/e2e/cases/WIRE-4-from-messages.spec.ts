/**
 * 4.3 "From Messages" origin on Orders / Receipts / kitchen ticket.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-4.3 Orders and Receipts render source_channel=messages", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const { data } = await sb
    .from("orders")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("source_channel", "messages")
    .limit(1)
    .maybeSingle();
  test.skip(!data, "failed-fixture: no orders.source_channel=messages row");
  await signInJourneysStaff(page, "/admin/pos?mode=counter&view=orders");
  await expect(page.locator("[data-pos-sale-origin='messages']").first()).toBeVisible({ timeout: 30_000 });
  await signInJourneysStaff(page, "/admin/pos?mode=counter&view=receipts");
  await expect(page.locator("[data-pos-sale-origin='messages']").first()).toBeVisible({ timeout: 30_000 });
});
