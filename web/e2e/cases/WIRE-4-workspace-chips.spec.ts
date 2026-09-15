/**
 * 4.4 Workspace Messages chips (conversation / opportunity / record).
 *
 * The row is `[data-inquiry-row=<id>]`; its conversation chip carries
 * `data-messaging-conversation=<state>`. The assertion compares the chip on
 * a NAMED row to that row's `inquiries.conversation_state`, so a stale or
 * mis-mapped chip fails rather than a different row happening to match.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { ensureHydrated } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-4.4 /admin/messages chips follow inquiry state columns", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/messages");
  await ensureHydrated(page, "[data-inquiry-row]");
  const rows = page.locator("[data-inquiry-row]");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const ids = (await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-inquiry-row")))).filter(Boolean) as string[];
  expect(ids.length).toBeGreaterThan(0);

  const sb = isolatedService();
  const { data } = await sb
    .from("inquiries")
    .select("id, conversation_state, opportunity_state")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("id", ids.slice(0, 20));
  const states = (data ?? []) as Array<{ id: string; conversation_state: string | null; opportunity_state: string | null }>;
  const named = states.find((s) => s.conversation_state);
  expect(named, "at least one listed row has a conversation state").toBeTruthy();

  const row = page.locator(`[data-inquiry-row="${named!.id}"]`);
  await expect(row.locator("[data-messaging-conversation]")).toHaveAttribute(
    "data-messaging-conversation",
    named!.conversation_state!,
  );
  if (named!.opportunity_state) {
    await expect(row.locator("[data-messaging-opportunity]")).toHaveAttribute("data-messaging-opportunity", named!.opportunity_state);
  }
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true", { timeout: 20_000 });
});
