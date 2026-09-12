/**
 * 3.7 Seat map + hold timer.
 * Refusal: two holds on one seat → seat_taken.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-3.7 event seat hold and seat_taken", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await page.goto("/events");
  const event = page.locator("a[href*='/events/']").first();
  test.skip((await event.count()) === 0, "failed-fixture: no public event");
  await event.click();
  const seat = page.locator("[data-seat], [data-e-seat]").first();
  if ((await seat.count()) > 0) {
    await seat.click();
    const sb = isolatedService();
    const { data } = await sb
      .from("admission_holds")
      .select("id, expires_at")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(data).toBeTruthy();
    const ctx = await page.context().newPage();
    await ctx.goto(page.url());
    await ctx.locator("[data-seat], [data-e-seat]").first().click();
    await assertEnglishRefusal(ctx, WIRE_SENTENCE.seatTaken);
    await ctx.close();
  }
});
