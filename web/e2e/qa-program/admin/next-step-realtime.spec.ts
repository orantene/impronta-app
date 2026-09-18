import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin — next-step + locale smoke", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("next-step block is present on an open thread", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    const next = page.locator("[data-next-step]");
    await expect(next.first()).toBeVisible({ timeout: 20_000 });
    const text = await next.first().innerText();
    expect(text.trim().length).toBeGreaterThan(0);
    await shot(page, "admin-next-step");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
