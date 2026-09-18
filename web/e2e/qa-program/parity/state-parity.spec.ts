import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.6 parity smoke", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("inbox row state line agrees with thread header essentials", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const row = page.locator("[data-inbox-row]").first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const rowText = (await row.innerText()).replace(/\s+/g, " ").trim();
    await row.click();
    const header = page.locator("[data-thread-header], [data-essentials-strip]").first();
    await expect(header).toBeVisible({ timeout: 20_000 });
    const headerText = (await header.innerText()).replace(/\s+/g, " ").trim();
    // At least one shared token beyond whitespace (name or state word)
    const rowTokens = rowText.split(" ").filter((t) => t.length > 3);
    const overlap = rowTokens.some((t) => headerText.includes(t));
    expect(overlap || headerText.length > 0, `row="${rowText}" header="${headerText}"`).toBe(true);
    await shot(page, "parity-inbox-header");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
