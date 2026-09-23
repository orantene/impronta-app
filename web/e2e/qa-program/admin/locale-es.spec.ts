import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  QA_HOST,
  shot,
  test,
} from "../_harness";

/**
 * Admin ES locale — required (Round 2). Sets the dashboard locale cookie
 * (there is no EN/ES/FR control on the Messages chrome) and asserts no raw keys.
 */
test.describe("QA 6.1 admin — ES locale", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("switching to ES keeps Messages free of raw keys", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await context.addCookies([
      { name: "locale", value: "es", url: QA_HOST },
    ]);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);

    await assertNoRawI18nKeys(page);
    const body = await page.locator("[data-messages-v5]").innerText();
    expect(body, "raw dashboard.messagesV5 key after ES cookie").not.toMatch(
      /dashboard\.messagesV5\./,
    );
    expect(body, "unfilled {placeholder} after ES cookie").not.toMatch(/\{[a-zA-Z_]+\}/);
    await shot(page, "admin-locale-es");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
