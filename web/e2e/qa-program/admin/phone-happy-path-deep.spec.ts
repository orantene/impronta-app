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

test.describe("QA 6.2 phone full happy path", () => {
  test.setTimeout(90_000);
  test("390: items → continue to offer → send", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    // Mobile tray uses sheet; wait for items list
    const sheet = page.locator("[data-sheet], [role='dialog']").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    // Tap first catalog option that looks selectable
    const opt = sheet.locator("button.opt, [data-option-row], [data-items-row] button").first();
    await expect(opt).toBeVisible({ timeout: 20_000 });
    await opt.click({ force: true });
    await page.waitForTimeout(500);
    const cont = sheet.locator("[data-items-send]");
    await expect(cont.first()).toBeEnabled({ timeout: 15_000 });
    await cont.first().click({ force: true });
    await page.waitForTimeout(1000);
    await shot(page, "admin-phone-happy-path-offer");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
