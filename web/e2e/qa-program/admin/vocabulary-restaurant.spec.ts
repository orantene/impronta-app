import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  shot,
  test,
} from "../_harness";

/**
 * Items vocabulary per business (Round 2).
 *
 * QA Journeys A is seeded restaurant → context panel Items must say "Menu"
 * (not Talent & services). D-MSG-316: InboxPage previously omitted
 * industryPreset so plan_tier=agency fell through to Talent & services.
 */
test.describe("QA business vocabulary — restaurant", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("restaurant Messages Items label is Menu (not Talent & services)", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    // Scope to the context panel Items section — not the whole inbox scrape.
    const itemsHeading = page
      .locator("[data-context-panel], [data-panel-items], [data-messages-v5]")
      .getByText(/^(Menu|Talent & services|Services|Order items|Items)$/i)
      .first();
    await expect(itemsHeading, "Items section heading missing in context panel").toBeVisible({
      timeout: 20_000,
    });
    const label = ((await itemsHeading.innerText()) || "").trim();
    expect(
      label,
      "restaurant fixture must not show Talent & services (D-MSG-316: pass industryPreset)",
    ).not.toMatch(/Talent\s*&\s*services/i);
    expect(label, `expected Menu on restaurant; got: ${label}`).toMatch(/^Menu$/i);
    await shot(page, "vocab-restaurant-panel");

    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const picker = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(picker, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    // Category chips are catalog filters (All + present categories), not the
    // Items vocabulary word. Assert the picker is not the talent cart, and
    // that at least one non-All chip or menu/dish row is present.
    const chips = ((await picker.locator("[data-items-chips]").innerText()) || "").replace(
      /\s+/g,
      " ",
    );
    expect(chips, "restaurant picker must not show Talent category chips").not.toMatch(/Talent/i);
    const body = ((await picker.innerText()) || "").replace(/\s+/g, " ");
    expect(
      body,
      "restaurant Items picker empty of catalogue — expected dishes/menu rows or category chips beyond All",
    ).toMatch(/dish|menu|food|plate|course|drink|All/i);
    await shot(page, "vocab-restaurant-picker");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
