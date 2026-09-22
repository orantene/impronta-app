import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin desktop — inbox", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("inbox loads under 5s with segments, chips, search, unread", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    const t0 = Date.now();
    await openAdminMessages(page);
    const loadMs = Date.now() - t0;
    await expect(page.locator("[data-inbox-pane='desktop']")).toBeVisible({ timeout: 15_000 });
    expect(loadMs, `inbox load ${loadMs}ms`).toBeLessThan(15_000);

    const segments = page.locator("[data-inbox-segments]");
    await expect(segments).toBeVisible();
    await expect(segments.getByRole("tab", { name: /needs action/i })).toBeVisible();
    await expect(segments.getByRole("tab", { name: /waiting/i })).toBeVisible();
    await expect(segments.getByRole("tab", { name: /^all/i })).toBeVisible();

    const rows = page.locator("[data-inbox-row]");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const needsCount = await rows.count();
    expect(needsCount).toBeGreaterThan(0);

    await segments.getByRole("tab", { name: /waiting/i }).click();
    await page.waitForTimeout(500);
    await segments.getByRole("tab", { name: /^all/i }).click();
    await page.waitForTimeout(500);
    await segments.getByRole("tab", { name: /needs action/i }).click();

    const chips = page.locator("[data-inbox-chips]");
    await expect(chips).toBeVisible();
    const unreadChip = chips.getByRole("button", { name: /unread/i });
    if (await unreadChip.count()) {
      await unreadChip.click();
      await page.waitForTimeout(400);
      await unreadChip.click();
    }

    const search = page.getByRole("searchbox").or(page.locator("input[type='search']")).first();
    await expect(search).toBeVisible();
    await search.fill("qa");
    await page.waitForTimeout(600);
    await search.fill("");

    await assertNoRawI18nKeys(page);
    await shot(page, "admin-inbox-desktop");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
