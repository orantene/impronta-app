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

const EXPECTED_TRAY = [
  "add_items",
  "offer",
  "times",
  "payment",
  "file",
  "template",
  "link",
  "reminder",
  "handover",
  "close_lost",
] as const;

const COMING_OK = new Set(["template"]);

test.describe("QA 6.1 admin desktop — + tray", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("every tray item opens a sheet or is marked coming", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);

    const tray = page.locator("[data-tray]").first();
    await expect(tray).toBeVisible({ timeout: 10_000 });
    await shot(page, "admin-tray-open");

    for (const key of EXPECTED_TRAY) {
      if ((await page.locator("[data-tray]").count()) === 0) {
        await openPlusTray(page);
      }
      const item = page.locator(`[data-tray-item="${key}"]`);
      await expect(item, `missing tray item ${key}`).toHaveCount(1);
      const disabled =
        (await item.getAttribute("disabled")) !== null ||
        (await item.getAttribute("aria-disabled")) === "true";
      if (COMING_OK.has(key)) {
        expect(disabled, `${key} should be coming/disabled`).toBe(true);
        continue;
      }
      expect(disabled, `${key} must not be a dead button`).toBe(false);
      await item.click();
      const sheet = page.locator("[data-sheet], [role='dialog'], [data-coming-sheet]").first();
      await expect(sheet).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
