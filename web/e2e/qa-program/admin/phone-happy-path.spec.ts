import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.2 phone happy path smoke", () => {
  test("phone: new conversation door and composer reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await expect(page.locator("[data-inbox-row]").first()).toBeVisible({ timeout: 20_000 });
    await openFirstInboxRow(page);
    await expect(page.locator("[data-composer-input], [data-composer]").first()).toBeVisible({
      timeout: 20_000,
    });
    // Composer should not sit under a fixed tab bar: bottom of composer above viewport bottom - tab bar
    const box = await page.locator("[data-composer], [data-composer-wire], .mx-cmp").first().boundingBox();
    expect(box, "composer box").toBeTruthy();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    await shot(page, "admin-phone-happy-smoke");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
