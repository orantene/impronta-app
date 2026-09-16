/**
 * 1.7 Payment link (POSPaymentLink).
 * Refusal: second link over outstanding → exceeds_outstanding.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  counterStartSale,
  counterAddItem,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, latestOrderIdByUrl } from "./_wire";

skipUnlessFixture();

test("WIRE-1.7 Collect › Link mints one open link and refuses a second over the outstanding", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await counterStartSale(page);
  await counterAddItem(page, "House pizza");
  await page.locator("[data-pos-charge]").first().click();
  await page.locator("[data-pos-method='link']").click();
  await page.locator("[data-pos-payment-link-create]").click();
  await expect(page.locator("[data-pos-payment-link-url]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-pos-payment-link-status='open'], [data-pos-payment-link-url]").first()).toBeVisible();
  const orderId = await latestOrderIdByUrl(page);
  const sb = isolatedService();
  const { data: link } = await sb
    .from("payment_links")
    .select("id, status, code, amount_cents")
    .eq("order_id", orderId)
    .eq("status", "open")
    .maybeSingle();
  expect(link, "payment_links row must be open").toBeTruthy();
  expect((link as { code: string }).code.length).toBeGreaterThan(0);
  expect(Number((link as { amount_cents: number }).amount_cents)).toBeGreaterThan(0);
  const { count } = await sb
    .from("order_collection_reservations")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  expect(count ?? 0).toBeGreaterThan(0);

  await page.locator("[data-pos-payment-link-create]").click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.exceedsOutstanding);

  const href = await page.locator("[data-pos-payment-link-url]").getAttribute("href");
  expect(href).toMatch(/\/pay\//);
});
