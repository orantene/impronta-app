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

test.describe("QA 6.1 merge / refund / confirm deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("merge card, cancel/refund sheet, confirm sheet when chips allow", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    // Merge card if present on this thread
    const merge = page.getByText(/same person|merge these|merge/i).first();
    if (await merge.isVisible().catch(() => false)) {
      await shot(page, "admin-merge-card");
      const mergeBtn = page.getByRole("button", { name: /^merge$/i }).first();
      if (await mergeBtn.isVisible().catch(() => false)) {
        await mergeBtn.click();
        await page.waitForTimeout(1000);
        await shot(page, "admin-merge-done");
      }
    }

    // Cancel/refund via next-step or header when available
    const cancel = page.getByRole("button", { name: /cancel|refund/i }).first();
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
      await expect(page.locator("[data-sheet], [role='dialog']").first()).toBeVisible({ timeout: 15_000 });
      await shot(page, "admin-cancel-refund-sheet");
      await page.keyboard.press("Escape");
    }

    // Confirm via next-step / tray dispatch: look for Confirm button
    const confirm = page.getByRole("button", { name: /^confirm/i }).first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
      await expect(page.locator("[data-sheet], [role='dialog']").first()).toBeVisible({ timeout: 15_000 });
      await shot(page, "admin-confirm-sheet");
      await page.keyboard.press("Escape");
    } else {
      // Try opening via next-step action
      const next = page.locator("[data-next-step-action]");
      if (await next.count()) {
        const label = await next.first().innerText();
        if (/confirm/i.test(label)) {
          await next.first().click();
          await shot(page, "admin-confirm-via-next");
        }
      }
    }

    void openPlusTray;
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
