/**
 * 4.1 Rail row + unread badge in every POS mode (MS01).
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { ALL_POS_MODES, ownerUserId } from "./_wire";

skipUnlessFixture();

test("WIRE-4.1 every mode rail has Messages and the unread count matches the gap", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  // The rail badge is `loadMessagingInbox(...).unreadCount` (messaging.md):
  // one per inquiry of the tenant whose `last_customer_message_at` is after
  // the signed-in person's `inquiry_message_reads.last_read_at` (or has no
  // read row), on the default location.
  const owner = await ownerUserId();
  const { data: inquiries } = await sb.from("inquiries").select("id, location_slug, last_customer_message_at").eq("tenant_id", JOURNEYS_TENANT_ID);
  const { data: reads } = await sb.from("inquiry_message_reads").select("inquiry_id, last_read_at").eq("user_id", owner);
  const readAt = new Map(((reads ?? []) as { inquiry_id: string; last_read_at: string }[]).map((r) => [r.inquiry_id, r.last_read_at]));
  const gap = ((inquiries ?? []) as { id: string; location_slug: string | null; last_customer_message_at: string | null }[]).filter((row) => {
    if ((row.location_slug ?? "default") !== "default") return false;
    if (!row.last_customer_message_at) return false;
    const last = readAt.get(row.id) ?? null;
    return !last || row.last_customer_message_at > last;
  }).length;
  expect(gap, "fixture carries unread conversations").toBeGreaterThan(0);

  for (const mode of ALL_POS_MODES) {
    await signInJourneysStaff(page, `/admin/pos?mode=${mode}`);
    const row = page.locator("[data-pos-rail-count='messages'], [data-pos-frame-link='messages']").first();
    await expect(row, `messages rail in ${mode}`).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveText(String(gap));
  }
});
