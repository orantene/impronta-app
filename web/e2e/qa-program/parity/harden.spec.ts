import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

test.describe("QA remaining: parity harden", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("five+ rows across segments: inbox token overlaps header", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const segments = page.locator("[data-inbox-segments]");
    const results: { seg: string; overlap: boolean; row: string; header: string }[] = [];

    for (const seg of ["needs action", "waiting", "all"]) {
      await segments.getByRole("tab", { name: new RegExp(seg, "i") }).click();
      await page.waitForTimeout(500);
      const rows = page.locator("[data-inbox-row]");
      const n = Math.min(await rows.count(), 3);
      for (let i = 0; i < n; i++) {
        const row = rows.nth(i);
        const rowText = (await row.innerText()).replace(/\s+/g, " ").trim();
        await row.click();
        await page.waitForTimeout(600);
        const header = page.locator("[data-thread-header], [data-essentials-strip]").first();
        await expect(header).toBeVisible({ timeout: 15_000 });
        const headerText = (await header.innerText()).replace(/\s+/g, " ").trim();
        const tokens = rowText.split(/\s+/).filter((t) => t.length > 3 && !/^\d+$/.test(t));
        const overlap = tokens.some((t) => headerText.toLowerCase().includes(t.toLowerCase()));
        results.push({ seg, overlap, row: rowText.slice(0, 80), header: headerText.slice(0, 80) });
      }
    }
    await shot(page, "remain-parity-harden");
    const ok = results.filter((r) => r.overlap).length;
    test.info().annotations.push({
      type: "parity",
      description: `${ok}/${results.length} overlaps`,
    });
    expect(ok, JSON.stringify(results, null, 2)).toBeGreaterThanOrEqual(3);
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
