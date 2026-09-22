import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  requireVisible,
  shot,
  test,
} from "../_harness";

/**
 * Admin ES locale — required (Round 2). Soft if-visible around the language
 * control previously let this pass without switching locales.
 */
test.describe("QA 6.1 admin — ES locale", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("switching to ES keeps Messages free of raw keys", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const lang = page.getByRole("button", { name: /^(EN|ES|FR)$/i }).first();
    await requireVisible(
      lang,
      "language control (EN/ES/FR) missing — cannot prove ES locale on Messages",
    );
    await lang.click();
    const es = page
      .getByRole("menuitem", { name: /español|spanish|^ES$/i })
      .or(page.getByText(/^ES$/i))
      .first();
    await requireVisible(es, "ES locale menu item missing after opening language control");
    await es.click();
    await page.waitForTimeout(1000);

    await assertNoRawI18nKeys(page);
    const body = await page.locator("[data-messages-v5]").innerText();
    expect(body, "raw dashboard.messagesV5 key after ES switch").not.toMatch(
      /dashboard\.messagesV5\./,
    );
    expect(body, "unfilled {placeholder} after ES switch").not.toMatch(/\{[a-zA-Z_]+\}/);
    await shot(page, "admin-locale-es");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
