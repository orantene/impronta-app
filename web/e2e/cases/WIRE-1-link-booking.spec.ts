/**
 * 1.5 Link a booking to a sale (POSLinkBooking).
 * Refusal: link twice → already_linked.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  counterStartSale,
  counterAddItem,
  counterCollectCash,
  expectCounterPaid,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { latestOrderIdByUrl } from "./_wire";
import { seedBookingWithBalance } from "./_wire-seed";

skipUnlessFixture();

/** Customer sheet › search the seeded customer › pick the hit (a draft "new customer" has no row and cannot list bookings). */
async function attachSeededCustomer(page: import("@playwright/test").Page, email: string, customerId: string): Promise<void> {
  await page.locator("[data-pos-open-customer]").click();
  await page.locator("#pos-customer-search").fill(email);
  const hit = page.locator(`[data-pos-customer-hit="${customerId}"]`);
  await expect(hit).toBeVisible({ timeout: 20_000 });
  await hit.click();
  await expect(page.locator("[data-pos-sheet='customer']")).toHaveCount(0, { timeout: 20_000 });
}

test("WIRE-1.5 basket Booking links once and refuses a second link", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const email = `wire-link-${Date.now()}@impronta.test`;
  const seed = await seedBookingWithBalance({ email });
  try {
    await openCounter(page);
    await counterStartSale(page);
    await counterAddItem(page, "House pizza");
    await attachSeededCustomer(page, email, seed.customerId);
    await page.locator("[data-pos-open-booking]").click();
    await expect(page.locator("[data-pos-booking-no-customer]")).toHaveCount(0);
    const candidate = page.locator(`[data-pos-booking-candidate="${seed.bookingId}"], [data-pos-booking-candidate]`).first();
    await expect(candidate, "the seeded booking must be offered").toBeVisible({ timeout: 20_000 });
    await candidate.click();
    await page.locator("[data-pos-link-only]").click();
    await expect(page.locator("[data-pos-booking-linked], [data-pos-line-booking]").first()).toBeVisible({
      timeout: 20_000,
    });
    const orderId = await latestOrderIdByUrl(page);
    const sb = isolatedService();
    const { data } = await sb
      .from("order_lines")
      .select("booking_id, booking_kind")
      .eq("order_id", orderId)
      .not("booking_id", "is", null)
      .limit(1)
      .maybeSingle();
    expect(data, "line must carry booking_id").toBeTruthy();
    expect((data as { booking_id: string }).booking_id).toBe(seed.bookingId);
    expect((data as { booking_kind: string | null }).booking_kind).toBeTruthy();

    // Second link: the sheet closes the door itself (disabled-by-design) with
    // its reason sentence naming the booking; the engine's `already_linked`
    // is unreachable from the screen. Nothing may change on the line.
    await page.locator("[data-pos-open-booking]").click();
    await expect(page.locator("[data-pos-booking-linked]")).toHaveText("This sale is already linked to WIRE link seed.", {
      timeout: 20_000,
    });
    await expect(page.locator("[data-pos-link-only]")).toBeDisabled();
    await expect(page.locator("[data-pos-booking-candidate]").first()).toBeDisabled();
    const { count } = await sb
      .from("order_lines")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .not("booking_id", "is", null);
    expect(count, "still exactly one linked line").toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-pos-sheet='link-booking']")).toHaveCount(0, { timeout: 20_000 });

    // Paying the sale writes `booking_transactions` against the linked booking (contract §3).
    await counterCollectCash(page);
    await expectCounterPaid(page);
    const paid = await sb
      .from("booking_transactions")
      .select("id, status, gross_amount_cents")
      .eq("booking_id", seed.bookingId)
      .eq("status", "paid");
    expect(paid.error, paid.error?.message).toBeNull();
    expect((paid.data ?? []).length, "a paid booking_transactions row for the linked booking").toBeGreaterThan(0);
  } finally {
    await seed.cleanup();
  }
});
