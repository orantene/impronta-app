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
import { WIRE_SENTENCE, assertEnglishRefusal, latestOrderIdByUrl, readOrder } from "./_wire";

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
  const orderId = await latestOrderIdByUrl(page);
  const beforePay = await readOrder(orderId);
  expect(beforePay.tipCents).toBeGreaterThan(0);

  await counterCollectCash(page);
  await expectCounterPaid(page);
  await page.locator("[data-pos-open-tip]").click({ timeout: 5_000 }).catch(() => undefined);
  if ((await page.locator("[data-pos-tip-confirm]").count()) > 0) {
    await page.locator("[data-pos-tip-confirm]").click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.alreadyCollected);
  } else {
    await expect(page.getByText(WIRE_SENTENCE.alreadyCollected).or(page.locator("[data-pos-open-tip]"))).toBeVisible();
  }
  expect((await readOrder(orderId)).tipCents).toBe(beforePay.tipCents);
});
