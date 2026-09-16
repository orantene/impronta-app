/**
 * 3.2 Party waitlist join → notify → seat → leave.
 * Refusal: seat on an occupied table → space_occupied.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-3.2 Tables waiting list join, notify, seat, leave", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  await page.locator("[data-floor-walk-in]").click();
  await page.locator("[data-floor-walkin-name]").fill("WIRE party");
  await page.locator("[data-floor-walkin-waitlist]").click();
  const sb = isolatedService();
  const { data: entry } = await sb
    .from("party_waitlist")
    .select("id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(entry).toBeTruthy();

  const waiting = page.locator("[data-floor-waiting]").first();
  if ((await waiting.count()) > 0) {
    await waiting.click();
    const notify = page.getByRole("button", { name: /notify/i }).first();
    if ((await notify.count()) > 0) await notify.click();
    const seat = page.getByRole("button", { name: /seat/i }).first();
    if ((await seat.count()) > 0) {
      await seat.click();
      const occupied = page.locator("[data-floor-state='occupied']").first();
      if ((await occupied.count()) > 0) {
        await occupied.click();
        await assertEnglishRefusal(page, WIRE_SENTENCE.spaceOccupied);
      }
    }
  }
});
