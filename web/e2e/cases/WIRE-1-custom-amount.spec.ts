/**
 * 1.1 POSCustomAmount — custom line under the limit.
 * Refusal: amount 0 (Continue stays disabled; no custom line).
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
  fillCustomAmount,
  latestCustomLine,
  latestOrderIdByUrl,
  openCustomAmountSheet,
  readCustomAmountLimitCents,
} from "./_wire";

skipUnlessFixture();

test("WIRE-1.1 custom amount under the limit writes a custom line", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const limit = await readCustomAmountLimitCents();
  test.skip(limit == null || limit <= 0, "failed-fixture: set a custom-amount limit first (1.3)");

  await openCounter(page);
  await counterStartSale(page);
  await openCustomAmountSheet(page);

  await page.locator("#pos-custom-what").fill("WIRE custom under");
  await expect(page.locator("[data-pos-custom-continue]")).toBeDisabled();
  expect(page.url().includes("order=")).toBeFalsy();

  await fillCustomAmount(page, "WIRE custom under", "500");
  await expect(page.locator("[data-pos-custom-limit]")).toHaveAttribute("data-pos-custom-limit", "within");
  await expect(page.locator("[data-pos-custom-continue]")).toBeEnabled();
  await page.locator("[data-pos-custom-continue]").click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  await expect(page.locator("[data-pos-line]").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-pos-custom-amount], [data-pos-line]").first()).toBeVisible();

  const orderId = await latestOrderIdByUrl(page);
  const line = await latestCustomLine(orderId);
  expect(line, "custom line must exist").toBeTruthy();
  expect(line!.kind).toBe("custom");
  expect(line!.amountCents).toBe(500);
  expect(line!.needsApproval).toBe(false);
});
