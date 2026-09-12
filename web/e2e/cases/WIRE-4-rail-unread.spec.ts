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
import { ALL_POS_MODES } from "./_wire";

skipUnlessFixture();

test("WIRE-4.1 every mode rail has Messages and the unread count matches the gap", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const { count: messages } = await sb
    .from("inquiry_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  const { count: reads } = await sb
    .from("inquiry_message_reads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  const gap = Math.max(0, (messages ?? 0) - (reads ?? 0));

  for (const mode of ALL_POS_MODES) {
    await signInJourneysStaff(page, `/admin/pos?mode=${mode}`);
    const row = page.locator("[data-pos-rail-count='messages'], [data-pos-frame-link='messages']").first();
    await expect(row, `messages rail in ${mode}`).toBeVisible({ timeout: 30_000 });
    if (gap > 0) {
      await expect(row).toContainText(String(gap));
    }
  }
});
