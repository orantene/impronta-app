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
 * QA Journeys A is seeded restaurant → context panel / Details must say "Menu"
 * (not Talent & services). Items picker chips lead with Menu.
 *
 * Historical incident: restaurant shipping the talent cart. This spec fails if
 * the restaurant fixture draws Talent & services as the Items label.
 */
test.describe("QA business vocabulary — restaurant", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("restaurant Messages Items label is Menu (not Talent & services)", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const panel = page.locator("[data-context-panel], [data-messages-v5]").first();
    await expect(panel).toBeVisible({ timeout: 20_000 });
    const body = ((await panel.innerText()) || "").replace(/\s+/g, " ");
    expect(
      body,
      "restaurant fixture must not show Talent & services as Items vocabulary",
    ).not.toMatch(/Talent\s*&\s*services/i);
    expect(
      /Menu/i.test(body) || /Order items|Services/i.test(body),
      `expected Menu (restaurant) Items label in panel; got snippet without Menu: ${body.slice(0, 400)}`,
    ).toBeTruthy();
    await shot(page, "vocab-restaurant-panel");

    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const picker = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(picker, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    const chips = ((await picker.locator("[data-items-chips]").innerText()) || "").replace(
      /\s+/g,
      " ",
    );
    expect(chips, "restaurant Items chips should include Menu").toMatch(/Menu/i);
    expect(
      chips,
      "restaurant Items chips must not lead with Talent (talent-cart leak)",
    ).not.toMatch(/^All\s+Talent/i);
    await shot(page, "vocab-restaurant-picker");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
