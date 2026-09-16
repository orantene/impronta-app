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
  fillCustomAmount,
  latestCustomLine,
  latestOrderIdByUrl,
  openCustomAmountSheet,
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
  await openCustomAmountSheet(page);
  const over = String((limit ?? 0) + 500);
  await fillCustomAmount(page, "WIRE custom over", over);
  await expect(page.locator("[data-pos-custom-limit]")).toHaveAttribute("data-pos-custom-limit", "over");
  await page.locator("[data-pos-custom-continue]").click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  const orderId = await latestOrderIdByUrl(page);
  const locked = await latestCustomLine(orderId);
  expect(locked?.needsApproval).toBe(true);

  const dialog = page.locator("[data-pos-dialog='manager-approval']");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-pos-approver]").first()).toBeVisible();
  await page.locator("[data-pos-approver]").first().click();

  const before = await countRows("pos_approvals", { order_id: orderId });
  await pressKeypad(page, WRONG_PIN);
  await page.locator("[data-pos-approve]").click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.pinInvalid);
  await expect(page.locator("[data-pos-approval-status]")).toBeVisible();
  expect(await countRows("pos_approvals", { order_id: orderId })).toBe(before);

  await pressKeypad(page, OWNER_PIN);
  await page.locator("[data-pos-approve]").click();
  await expect(page.locator("[data-pos-line-approval]")).toHaveCount(0, { timeout: 30_000 });
  expect(await countRows("pos_approvals", { order_id: orderId })).toBeGreaterThan(before);
  const unlocked = await latestCustomLine(orderId);
  expect(unlocked?.needsApproval).toBe(false);
});
