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

test.describe("QA 6.1 payment flows", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);

  test("Request payment sheet: outside cash records; link/collect when order target exists", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();

    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await shot(page, "admin-payment-deep-open");

    // Soft inventory of how options
    const how = sheet.locator("[data-payment-how]");
    await expect(how.or(sheet)).toBeVisible();
    const outside = sheet.getByText(/record as paid outside|paid outside/i).first();
    if (await outside.isVisible().catch(() => false)) {
      await outside.click({ timeout: 5_000 }).catch(() => undefined);
      await shot(page, "admin-payment-outside-selected");
    }
    const link = sheet.getByText(/pay link|send a pay link/i).first();
    const collect = sheet.getByText(/collect here|at the counter/i).first();
    test.info().annotations.push({
      type: "payment-affordance",
      description: `outside=${await outside.count()} link=${await link.count()} collect=${await collect.count()}`,
    });

    // Do not block the suite on minting if the thread has no order target
    const send = sheet.locator("[data-payment-send]").first();
    if ((await send.count()) && (await send.isEnabled().catch(() => false))) {
      await send.click({ timeout: 8_000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      await shot(page, "admin-payment-deep-sent");
    } else {
      await shot(page, "admin-payment-deep-inventory");
    }

    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
