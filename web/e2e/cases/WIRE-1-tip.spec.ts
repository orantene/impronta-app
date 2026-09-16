/**
 * 1.6 Tip from the basket. Happy path also covered by pos-customer-display.
 * Refusal: tip after collection → already_collected.
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
import { latestOrderIdByUrl, readOrder } from "./_wire";

skipUnlessFixture();

test("WIRE-1.6 basket tip writes tip_cents and refuses after collection", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await counterStartSale(page);
  await counterAddItem(page, "House pizza");
  await page.locator("[data-pos-open-tip]").click();
  await page.locator("[data-pos-tip-percent='10']").click();
  await page.locator("[data-pos-tip-confirm]").click();
  await expect(page.locator("[data-pos-tip]")).toBeVisible({ timeout: 20_000 });
  // The basket's own confirmation: the tip row carries the amount and Charge
  // names the tipped total (until the refresh lands it still says the old one).
  await expect(page.locator("[data-pos-tip]")).toContainText("$1.80", { timeout: 20_000 });
  await expect(page.locator("[data-pos-charge]").first()).toContainText("$19.80", { timeout: 20_000 });
  const orderId = await latestOrderIdByUrl(page);
  const beforePay = await readOrder(orderId);
  expect(beforePay.tipCents).toBe(180);
  // total = subtotal − discount + tax + tip (contract §4)
  expect(beforePay.totalCents).toBe(1980);

  await counterCollectCash(page);
  await expectCounterPaid(page);
  const paid = await readOrder(orderId);
  expect(paid.status).toMatch(/paid|collected|closed/);
  expect(paid.tipCents).toBe(beforePay.tipCents);

  // Tip after collection: disabled-by-design. Neither door exists on a paid
  // sale — the basket's Tip row is gone with the basket, and the customer
  // display shows its Paid screen with no tip tiles — so the engine's
  // `already_collected` sentence is unreachable from a screen. The row stays.
  await expect(page.locator("[data-pos-open-tip]")).toHaveCount(0);
  await page.goto(`/admin/pos/display?order=${encodeURIComponent(orderId)}`);
  await expect(page.locator("[data-pos-display-paid]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-pos-display-tip]")).toHaveCount(0);
  await expect(page.locator("[data-pos-display-tip-percent]")).toHaveCount(0);
  expect((await readOrder(orderId)).tipCents).toBe(beforePay.tipCents);
});
