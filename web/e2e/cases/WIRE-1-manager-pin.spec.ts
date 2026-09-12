/**
 * 1.2 POSManagerApproval — custom amount over the limit + manager PIN.
 * Refusal: wrong PIN → pin_invalid, no pos_approvals row.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  counterStartSale,
  skipUnlessFixture,
} from "./_harness";
import {
  OWNER_PIN,
  WIRE_SENTENCE,
  WRONG_PIN,
  assertEnglishRefusal,
  countRows,
  latestCustomLine,
  latestOrderIdByUrl,
  pressKeypad,
  readCustomAmountLimitCents,
} from "./_wire";

skipUnlessFixture();

test("WIRE-1.2 over-limit custom amount needs the right manager PIN", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const limit = await readCustomAmountLimitCents();
  test.skip(limit == null, "failed-fixture: custom-amount limit missing");

  await openCounter(page);
  await counterStartSale(page);
  await page.getByRole("button", { name: /custom amount/i }).click();
  const over = String((limit ?? 0) + 500);
  await pressKeypad(page, over);
  await expect(page.locator("[data-pos-custom-limit]")).toHaveAttribute("data-pos-custom-limit", "over");
  await page.locator("[data-pos-custom-continue]").click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  const orderId = await latestOrderIdByUrl(page);
  const locked = await latestCustomLine(orderId);
  expect(locked?.needsApproval).toBe(true);

  await expect(page.locator("[data-pos-dialog='manager-approval'], [data-pos-approve]").first()).toBeVisible({
    timeout: 20_000,
  });
  const before = await countRows("pos_approvals", { order_id: orderId });
  await pressKeypad(page, WRONG_PIN);
  await page.locator("[data-pos-approve]").click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.pinInvalid);
  expect(await countRows("pos_approvals", { order_id: orderId })).toBe(before);

  await pressKeypad(page, OWNER_PIN);
  await page.locator("[data-pos-approve]").click();
  await expect(page.locator("[data-pos-line-approval]")).toHaveCount(0, { timeout: 30_000 });
  expect(await countRows("pos_approvals", { order_id: orderId })).toBeGreaterThan(before);
});
