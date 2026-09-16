/**
 * 3.7 Seat map + hold timer.
 * Refusal: two holds on one seat from two guests → seat_taken.
 *
 * The night and its seat map are SEEDED (the fixture's nights are in the past
 * and it carries no `event_seat_maps`), so the seat chips are on the page and
 * every step below asserts; nothing is skipped because a control happened
 * to be absent.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { ensureHydrated, seedEventNight, seedSeatMap } from "./_wire-seed";

skipUnlessFixture();

/** The public picker's own sentence (ticket-picker-island.tsx), not the dashboard's. */
const PICKER_SEAT_TAKEN = "That seat was just taken.";

test("WIRE-3.7 event seat hold and seat_taken", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const night = await seedEventNight();
  const seats = await seedSeatMap({ sessionId: night.sessionId });
  const pickNight = async (p: typeof page) => {
    await ensureHydrated(p, "input[name='night']");
    await p.locator(`input[name='night'][value='${night.sessionId}']`).check();
  };
  try {
    await prepareJourneysPage(page);
    await page.goto(`/events/${night.slug}`);
    await pickNight(page);
    const seat = page.locator(`[data-seat="${seats.seatIds[0]}"]`);
    await expect(seat, "the seeded seat chip must render").toBeVisible({ timeout: 30_000 });
    await seat.click();
    await expect(seat).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("ticket-hold-seats").click();

    const sb = isolatedService();
    await expect
      .poll(
        async () => {
          const { data } = await sb
            .from("admission_holds")
            .select("id, status, expires_at")
            .eq("tenant_id", JOURNEYS_TENANT_ID)
            .eq("seat_space_id", seats.seatIds[0])
            .eq("status", "held")
            .maybeSingle();
          return data?.id ?? null;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();

    // A SECOND GUEST (its own context, so its own guest session) wants the same seat.
    const other = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
    const page2 = await other.newPage();
    await prepareJourneysPage(page2);
    await page2.goto(`/events/${night.slug}`);
    await pickNight(page2);
    const seat2 = page2.locator(`[data-seat="${seats.seatIds[0]}"]`);
    await expect(seat2).toBeVisible({ timeout: 30_000 });
    await seat2.click();
    await page2.getByTestId("ticket-hold-seats").click();
    await expect(page2.getByText(PICKER_SEAT_TAKEN, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await other.close();

    const { count } = await sb
      .from("admission_holds")
      .select("id", { count: "exact", head: true })
      .eq("seat_space_id", seats.seatIds[0])
      .eq("status", "held");
    expect(count, "one seat, one live hold").toBe(1);
  } finally {
    await seats.cleanup();
    await night.cleanup();
  }
});
