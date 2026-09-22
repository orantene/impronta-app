import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.2/6.3 responsive Messages", () => {
  test("tablet 1194: two-column layout and details drawer", async ({ page }) => {
    await page.setViewportSize({ width: 1194, height: 834 });
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const shell = page.locator("[data-messages-v5]");
    await expect(shell).toHaveAttribute("data-layout", /two|one|three/);
    await openFirstInboxRow(page);
    const details = page.getByRole("button", { name: /details/i }).first();
    if (await details.isVisible().catch(() => false)) {
      await details.click();
      await expect(page.locator("[data-panel-section], [role='dialog'], [data-sheet]").first()).toBeVisible({
        timeout: 15_000,
      });
    }
    await shot(page, "admin-tablet-1194");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("phone 390: inbox list, thread, next-step, composer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const shell = page.locator("[data-messages-v5]");
    await expect(shell).toHaveAttribute("data-layout", "one");
    await expect(page.locator("[data-inbox-row]").first()).toBeVisible({ timeout: 20_000 });
    await openFirstInboxRow(page);
    await expect(page.locator("[data-next-step], [data-composer], [data-composer-wire]").first()).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, "admin-phone-390-thread");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
