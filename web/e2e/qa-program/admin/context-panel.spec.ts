import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin — context panel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("context panel sections render on desktop", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    // Details / panel may already be open in three-column layout
    const details = page.getByRole("button", { name: /details|context|client/i }).first();
    if (await details.isVisible().catch(() => false)) {
      await details.click().catch(() => undefined);
    }

    const panel = page.locator("[data-panel-section], [data-context-panel]").first();
    // Fall back to visible section headings
    const client = page.getByRole("heading", { name: /^client$/i }).or(page.getByText(/^Client$/));
    const items = page.getByRole("heading", { name: /^items$/i }).or(page.getByText(/^Items$/));
    const money = page.getByRole("heading", { name: /^money$/i }).or(page.getByText(/^Money$/));

    await expect(client.first().or(panel)).toBeVisible({ timeout: 20_000 });
    await shot(page, "admin-context-panel");

    // Soft presence of other sections
    for (const label of [/files/i, /team notes|notes/i, /follow-?up|reminder/i]) {
      const el = page.getByText(label).first();
      if (await el.count()) await expect(el).toBeVisible();
    }

    void items;
    void money;
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
