import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

/**
 * Deep companion to merge-refund-confirm.spec.ts.
 * Confirm uses race-B times door (same as appointment double-book / D-MSG-310).
 * Merge proof lives in the required shallow file (seeded pair).
 */
const RACE_B = process.env.QA_DOUBLE_BOOK_B ?? "08f2a0b7-1312-4f17-9ec4-f154aaa2e502";

test.describe("QA 6.1 merge / refund / confirm deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("confirm sheet opens from race-B times Confirm door", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", RACE_B);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const timesConfirm = page.locator('[data-times-action="confirm"]').first();
    await expect(
      timesConfirm,
      "Confirm door missing — seed picked professional_times on race-B (D-MSG-310)",
    ).toBeVisible({ timeout: 20_000 });
    await timesConfirm.click();
    await expect(
      page.locator("[data-confirm-sheet]").first(),
      "Confirm sheet did not open",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-confirm-sheet");
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
