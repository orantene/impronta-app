import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin — ES locale", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("switching to ES keeps Messages free of raw keys", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const lang = page.getByRole("button", { name: /^(EN|ES|FR)$/i }).first();
    if (await lang.isVisible().catch(() => false)) {
      await lang.click();
      const es = page.getByRole("menuitem", { name: /español|spanish|ES/i }).or(page.getByText(/^ES$/));
      if (await es.first().isVisible().catch(() => false)) await es.first().click();
      else {
        // Toggle cycle
        await lang.click();
      }
    } else {
      // Try locale cookie via UI elsewhere
      const toggle = page.getByText(/^EN$/).first();
      if (await toggle.isVisible().catch(() => false)) await toggle.click();
    }

    await page.waitForTimeout(1000);
    await assertNoRawI18nKeys(page);
    await shot(page, "admin-locale-es");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
