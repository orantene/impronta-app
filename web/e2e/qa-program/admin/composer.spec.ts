import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin desktop — composer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("reply, internal note, and cmd+Enter send", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const input = page.locator("[data-composer-input]").first();
    await expect(input).toBeVisible({ timeout: 20_000 });

    const replyBody = `QA-REPLY ${Date.now()}`;
    await input.fill(replyBody);
    await page.locator("[data-composer-send]").first().click();
    await expect(page.getByText(replyBody).first()).toBeVisible({ timeout: 25_000 });

    // Switch to internal note if the mode control exists
    const noteToggle = page.getByRole("button", { name: /internal note|note/i }).first();
    if (await noteToggle.isVisible().catch(() => false)) {
      await noteToggle.click();
      const noteBody = `QA-NOTE ${Date.now()}`;
      await input.fill(noteBody);
      await page.locator("[data-composer-send]").first().click();
      await expect(page.getByText(noteBody).first()).toBeVisible({ timeout: 25_000 });
      // Back to reply for cmd+Enter
      const replyToggle = page.getByRole("button", { name: /^reply$/i }).first();
      if (await replyToggle.isVisible().catch(() => false)) await replyToggle.click();
    }

    const cmdBody = `QA-CMD ${Date.now()}`;
    await input.fill(cmdBody);
    await input.press("Meta+Enter");
    await expect(page.getByText(cmdBody).first()).toBeVisible({ timeout: 25_000 });

    const via = page.locator("[data-composer-via]");
    if (await via.count()) {
      await expect(via.first()).toBeVisible();
    }

    await assertNoRawI18nKeys(page);
    await shot(page, "admin-composer-reply");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
