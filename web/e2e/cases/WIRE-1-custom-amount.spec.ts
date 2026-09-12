/**
 * 1.1 POSCustomAmount — custom line under the limit.
 * Refusal: amount 0.
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
  assertEnglishRefusal,
  latestCustomLine,
  latestOrderIdByUrl,
  pressKeypad,
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
  await page.getByRole("button", { name: /custom amount/i }).click();
  await expect(page.locator("[data-pos-sheet='custom-amount']")).toBeVisible({ timeout: 20_000 });

  await pressKeypad(page, "0");
  await page.locator("[data-pos-custom-continue]").click();
  await expect(page.getByText(/amount|zero|cannot/i).first()).toBeVisible({ timeout: 15_000 });
  const beforeUrl = page.url();
  expect(beforeUrl.includes("order=")).toBeFalsy();

  await pressKeypad(page, "500");
  await expect(page.locator("[data-pos-custom-limit]")).toHaveAttribute("data-pos-custom-limit", "within");
  await page.locator("[data-pos-custom-continue]").click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  const orderId = await latestOrderIdByUrl(page);
  const line = await latestCustomLine(orderId);
  expect(line, "custom line must exist").toBeTruthy();
  expect(line!.kind).toBe("custom");
  expect(line!.amountCents).toBe(500);
  expect(line!.needsApproval).toBe(false);
});
