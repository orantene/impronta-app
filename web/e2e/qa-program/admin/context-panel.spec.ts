import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

/**
 * Context panel (Round 2) — required Client / Items / Money sections.
 * PanelSection toggle is `button[name="Collapse: <title>"]` (kit).
 * Journeys labels Items as Menu.
 */
test.describe("QA 6.1 admin — context panel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("context panel Client + Items + Money sections render", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const panel = page.locator("[data-context-panel]").first();
    await expect(panel, "context panel missing on desktop Messages").toBeVisible({
      timeout: 20_000,
    });

    await expect(
      panel.getByRole("button", { name: /Collapse:\s*Client/i }),
      "Client section missing",
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      panel.getByRole("button", {
        name: /Collapse:\s*(Items|Menu|Talent & services|Services|Order items)/i,
      }),
      "Items (or industry label) section missing",
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      panel.getByRole("button", { name: /Collapse:\s*Money/i }),
      "Money section missing",
    ).toBeVisible({ timeout: 10_000 });

    await shot(page, "admin-context-panel");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
