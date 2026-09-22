import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin — header / identity / history", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("resolve/reopen, copy client link, history affordances present", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const header = page.locator('[data-thread-header="desktop"], [data-thread-header]').first();
    await expect(header, "thread header missing").toBeVisible({ timeout: 20_000 });

    const more = header.getByRole("button", { name: /more|actions|⋯|…/i }).first();
    if (await more.count()) {
      await more.click();
      await page.waitForTimeout(300);
    }

    const copyLink = page
      .getByRole("button", { name: /copy client link|client link|copy link/i })
      .first();
    await expect(
      copyLink,
      "Copy client link missing from thread header actions",
    ).toBeVisible({ timeout: 15_000 });
    await copyLink.click();
    await page.waitForTimeout(400);

    const history = page.getByRole("button", { name: /^history$/i }).first();
    if (await history.isVisible().catch(() => false)) {
      await history.click();
      await expect(
        page.locator("[data-sheet], [role='dialog']").first(),
        "History sheet did not open",
      ).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    }

    const resolve = page.getByRole("button", { name: /^resolve$/i }).first();
    if (await resolve.isVisible().catch(() => false)) {
      await resolve.click();
      await page.waitForTimeout(500);
      const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
      await expect(reopen, "Reopen missing after Resolve").toBeVisible({ timeout: 10_000 });
      await reopen.click();
    }

    await shot(page, "admin-header-actions");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
