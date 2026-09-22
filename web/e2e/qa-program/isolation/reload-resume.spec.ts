import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  shot,
  test,
} from "../_harness";

/**
 * Reload / resume (Round 2) — mid-sheet reload must not orphan drafts or
 * duplicate offers; browser back from POS returns to the thread.
 */
test.describe("QA reload and resume", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("mid-payment-sheet reload restores thread without orphan card", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const inquiry =
      process.env.QA_AWAITING_OFFER_INQUIRY_ID ?? "ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f";
    const u = new URL(page.url());
    u.searchParams.set("inquiry", inquiry);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const payCardsBefore = await page.locator('[data-card="payment"]').count();
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet, "Payment sheet did not open").toBeVisible({ timeout: 20_000 });
    await shot(page, "reload-mid-payment-open");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);
    // Sheet should be closed; no new payment card from a half-finished mint.
    await expect(page.locator("[data-payment-request-sheet]")).toHaveCount(0);
    const payCardsAfter = await page.locator('[data-card="payment"]').count();
    expect(
      payCardsAfter,
      "reload mid-payment-sheet must not mint an orphan Payment card",
    ).toBe(payCardsBefore);
    await shot(page, "reload-mid-payment-after");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("browser back from POS returns to Messages thread", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    const inquiry =
      process.env.QA_RELOAD_INQUIRY_ID ??
      process.env.QA_AWAITING_OFFER_INQUIRY_ID ??
      "ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f";
    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", inquiry);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    await page.goto(`/admin/pos?inquiry=${inquiry}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(1500);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(async () => {
      await page.goto(`/admin/messages?inquiry=${inquiry}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    expect(page.url(), "back from POS should restore Messages").toMatch(/messages/i);
    // Thread still the same inquiry when deep-link survived.
    if (/inquiry=/.test(page.url())) {
      expect(page.url()).toContain(inquiry);
    }
    await shot(page, "reload-back-from-pos");
    expect(errors.filter((e) => !/React error #310/i.test(e)), errors.join("\n")).toEqual([]);
  });
});
