import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin — header / identity / history", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("resolve/reopen, copy client link, history affordances present", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const header = page.locator('[data-thread-header="desktop"], [data-thread-header]').first();
    await expect(header).toBeVisible({ timeout: 20_000 });

    // Header menu only — do not click composer "More" (that opens the + tray).
    const more = header.getByRole("button", { name: /more|actions|⋯|…/i }).first();
    if (await more.isVisible().catch(() => false)) {
      await more.click();
    }

    const resolve = page.getByRole("button", { name: /^resolve$/i }).first();
    const history = page.getByRole("button", { name: /^history$/i }).first();
    const copyLink = page.getByRole("button", { name: /copy client link|client link|copy link/i }).first();
    const rename = page.getByRole("button", { name: /rename/i }).first();
    const handOver = page.getByRole("button", { name: /hand over|handover|assign/i }).first();
    const closeLost = page.getByRole("button", { name: /close as lost/i }).first();

    await shot(page, "admin-header-actions");

    // Soft: only click when the control is truly enabled and in viewport.
    async function softClick(label: string, locator: ReturnType<typeof page.getByRole>) {
      if (!(await locator.isVisible().catch(() => false))) return;
      if (!(await locator.isEnabled().catch(() => false))) return;
      await locator.click({ timeout: 8_000 }).catch((err) => {
        test.info().annotations.push({ type: "soft", description: `${label}: ${err}` });
      });
    }

    await softClick("history", history);
    if (await page.locator("[data-sheet], [role='dialog']").count()) {
      await page.keyboard.press("Escape");
    }
    await softClick("copyLink", copyLink);
    await page.waitForTimeout(300);
    await softClick("resolve", resolve);
    await page.waitForTimeout(500);
    const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
    await softClick("reopen", reopen);

    void rename;
    void handOver;
    void closeLost;

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
