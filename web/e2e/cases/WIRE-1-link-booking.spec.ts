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
  counterNameBuyer,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, latestOrderIdByUrl } from "./_wire";

skipUnlessFixture();

test("WIRE-1.5 basket Booking links once and refuses a second link", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await counterStartSale(page);
  await counterAddItem(page, "House pizza");
  await counterNameBuyer(page, `wire-link-${Date.now()}@impronta.test`);
  await page.locator("[data-pos-open-booking]").click();
  const noCustomer = page.locator("[data-pos-booking-no-customer]");
  await expect(noCustomer).toHaveCount(0);
  const candidate = page.locator("[data-pos-booking-candidate]").first();
  test.skip((await candidate.count()) === 0, "failed-fixture: no booking candidate for the named buyer");
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
  expect((data as { booking_kind: string | null }).booking_kind).toBeTruthy();

  await page.locator("[data-pos-open-booking]").click();
  const again = page.locator("[data-pos-booking-candidate]").first();
  if ((await again.count()) > 0) {
    await again.click();
    await page.locator("[data-pos-link-only]").click();
  }
  await assertEnglishRefusal(page, WIRE_SENTENCE.alreadyLinked);
});
