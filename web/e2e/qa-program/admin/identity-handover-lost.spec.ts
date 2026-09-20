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

test.describe("QA 6.1 identity / handover / close lost", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("hand over, close as lost from tray; identity capture when present", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    // Identity capture card if shown
    const identity = page.locator("[data-card='identity'], [data-identity-save]").first();
    if (await identity.isVisible().catch(() => false)) {
      await shot(page, "admin-identity-capture-present");
      const createNew = page.getByText(/create a new client/i).first();
      if (await createNew.isVisible().catch(() => false)) await createNew.click();
    }

    // Hand over via tray
    await openPlusTray(page);
    await page.locator('[data-tray-item="handover"]').click();
    await expect(page.locator("[data-sheet], [role='dialog']").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-handover-sheet");
    // Pick first staff option if any
    const staff = page.locator("[data-sheet] button, [role='dialog'] button").filter({ hasText: /.+/ }).nth(1);
    if (await staff.isVisible().catch(() => false)) {
      await staff.click().catch(() => undefined);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // Close as lost
    await openPlusTray(page);
    await page.locator('[data-tray-item="close_lost"]').click();
    const lostSheet = page.locator("[data-sheet], [role='dialog']").first();
    await expect(lostSheet).toBeVisible({ timeout: 15_000 });
    const reason = lostSheet.locator("textarea, input").first();
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill("QA program close as lost");
    }
    const confirm = lostSheet.getByRole("button", { name: /close|lost|confirm/i }).last();
    if (await confirm.isEnabled().catch(() => false)) {
      await confirm.click();
      await page.waitForTimeout(1000);
      await shot(page, "admin-close-lost-done");
      const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
      if (await reopen.isVisible().catch(() => false)) {
        await reopen.click();
        await page.waitForTimeout(800);
        await shot(page, "admin-close-lost-reopened");
      }
    } else {
      await shot(page, "admin-close-lost-blocked");
      await page.keyboard.press("Escape");
    }

    // Mine chip
    const mine = page.locator("[data-inbox-chips]").getByRole("button", { name: /^mine$/i });
    if (await mine.count()) {
      await mine.click();
      await page.waitForTimeout(400);
      await mine.click();
    }

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
