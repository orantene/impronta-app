import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.6 parity five states", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("five inbox rows: row text overlaps header essentials", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    // Sample Needs + Waiting
    const segments = page.locator("[data-inbox-segments]");
    const results: { seg: string; overlap: boolean; row: string; header: string }[] = [];

    for (const seg of ["needs action", "waiting", "all"]) {
      await segments.getByRole("tab", { name: new RegExp(seg, "i") }).click();
      await page.waitForTimeout(500);
      const rows = page.locator("[data-inbox-row]");
      const n = Math.min(await rows.count(), 2);
      for (let i = 0; i < n; i++) {
        const row = rows.nth(i);
        const rowText = (await row.innerText()).replace(/\s+/g, " ").trim();
        await row.click();
        await page.waitForTimeout(500);
        const header = page.locator("[data-thread-header], [data-essentials-strip]").first();
        await expect(header).toBeVisible({ timeout: 15_000 });
        const headerText = (await header.innerText()).replace(/\s+/g, " ").trim();
        const tokens = rowText.split(" ").filter((t) => t.length > 3);
        const overlap = tokens.some((t) => headerText.includes(t));
        results.push({ seg, overlap, row: rowText.slice(0, 80), header: headerText.slice(0, 80) });
      }
    }
    await shot(page, "parity-five-states");
    const ok = results.filter((r) => r.overlap).length;
    expect(ok, JSON.stringify(results, null, 2)).toBeGreaterThanOrEqual(2);
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
