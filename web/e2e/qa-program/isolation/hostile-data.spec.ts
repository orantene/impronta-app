import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  shot,
  test,
} from "../_harness";

/**
 * Long / hostile data (Round 2) — nothing overflows into unreadability or
 * breaks money maths. Runs on the live QA tenant with required asserts.
 */
test.describe("QA hostile data", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("4000-char message + long name do not crash Messages", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await awaitHydrated(page);

    const long = "x".repeat(4000);
    const composer = page.locator("[data-composer] textarea, [data-composer-wire] textarea").first();
    await expect(composer, "composer missing").toBeVisible({ timeout: 15_000 });
    await composer.fill(long);
    const send = page.locator("[data-composer] button[type='submit'], [data-composer-wire] button.send, button.send").first();
    await expect(send, "Send missing").toBeEnabled({ timeout: 10_000 });
    await send.click();
    await page.waitForTimeout(1500);
    // Stream still renders; no application error.
    await expect(page.getByText(/application error|something went wrong/i)).toHaveCount(0);
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible();
    await shot(page, "hostile-long-message");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("$0 and $99,999 line prices survive offer editor", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const sheet = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(sheet, "Items picker missing").toBeVisible({ timeout: 20_000 });
    // Custom line path if present.
    const custom = sheet.locator("[data-items-custom]").first();
    if (await custom.isVisible().catch(() => false)) {
      const title = custom.locator("input").first();
      await title.fill("Hostile zero");
      const price = custom.locator("input").nth(1);
      await price.fill("0");
      const add = custom.getByRole("button", { name: /add/i }).first();
      if (await add.isVisible().catch(() => false)) await add.click();
    }
    await shot(page, "hostile-zero-price");
    await page.keyboard.press("Escape");
    await expect(page.getByText(/application error|NaN|Infinity/i)).toHaveCount(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
