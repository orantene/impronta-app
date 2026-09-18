import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin — times and payment sheets", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Times and Request payment sheets open from tray", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    await openPlusTray(page);
    await page.locator('[data-tray-item="times"]').click();
    await expect(page.locator("[data-sheet], [role='dialog']").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-times-sheet");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    await expect(page.locator("[data-sheet], [role='dialog']").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-payment-sheet");
    // Look for pay-link / outside / collect options
    const body = await page.locator("[data-sheet], [role='dialog']").first().innerText();
    expect(body.length).toBeGreaterThan(10);
    await page.keyboard.press("Escape");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
