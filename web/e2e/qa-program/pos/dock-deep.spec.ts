import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

test.describe("QA 6.4 POS dock deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("messages dock beside counter; back-office continuity query", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/pos?mode=counter&view=messages");
    await expect(page.locator("[data-pos-messages], [data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "pos-dock-deep");

    // Return / back office link if present
    const back = page.getByRole("link", { name: /back office|workspace|return/i }).or(page.getByRole("button", { name: /back office|return to sale/i }));
    if (await back.first().isVisible().catch(() => false)) {
      await shot(page, "pos-back-office-affordance");
    }

    // Phone bar seam documentation at 390
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const phoneBar = page.locator("[data-pos-phone-nav], nav").filter({ hasText: /sale|messages/i });
    await shot(page, "pos-phone-bar");
    if ((await phoneBar.count()) === 0) {
      test.info().annotations.push({ type: "seam", description: "POS phone bottom bar not wired (known)" });
    }

    await assertNoRawI18nKeys(page);
    expect(errors.filter((e) => !/hydration|ResizeObserver/i.test(e)), errors.join("\n")).toEqual([]);
  });
});
