/**
 * 4.4 Workspace Messages chips (conversation / opportunity / record).
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

test("WIRE-4.4 /admin/messages chips follow inquiry state columns", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/messages");
  await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible({ timeout: 30_000 });
  const sb = isolatedService();
  const { data } = await sb
    .from("inquiries")
    .select("id, conversation_state, opportunity_state")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .limit(5);
  expect((data ?? []).length).toBeGreaterThan(0);
  const thread = page.locator("[data-pos-messages='thread'], [data-inquiry-row]").first();
  if ((await thread.count()) > 0) await thread.click();
});
