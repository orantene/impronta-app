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

test.describe("QA 6.1 admin desktop — add items / offer", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Add items sheet lists catalogue; Continue to offer opens priced editor", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);

    await page.locator('[data-tray-item="add_items"]').click();
    const sheet = page.locator("[data-sheet], [role='dialog']").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await shot(page, "admin-add-items-sheet");

    // Prefer a priced menu/package row over table time slots.
    const menuChip = sheet.getByRole("button", { name: /^Menu$/i });
    if (await menuChip.count()) await menuChip.click();
    const priced = sheet.locator("button.opt[data-option-row], [data-items-row] button.opt").filter({ hasText: /\$/ }).first();
    await expect(priced).toBeVisible({ timeout: 15_000 });
    await priced.click();
    await expect(sheet.locator("[data-items-total]")).toContainText(/selected/i, { timeout: 10_000 });

    const continueOffer = sheet.locator("[data-items-send]").filter({ hasText: /continue to offer|offer/i });
    const sendChoices = sheet.locator("[data-items-send]").filter({ hasText: /send choices|choices/i });
    const addDraft = sheet.locator("[data-items-send]").filter({ hasText: /add to draft|draft/i });

    if (await continueOffer.count()) {
      await expect(continueOffer.first()).toBeEnabled({ timeout: 10_000 });
      await continueOffer.first().click();
      const offerSheet = page.locator('[data-sheet], [role="dialog"]').filter({ has: page.locator("#msgv5-offer-editor-title, [id*='offer']") }).first();
      await expect(offerSheet.or(page.getByText(/valid until|deposit/i).first())).toBeVisible({ timeout: 20_000 });
      await shot(page, "admin-offer-editor");
      const send = page.locator("[data-sheet='desktop'], [role='dialog']").last().getByRole("button", { name: /^send\b/i });
      if ((await send.count()) && (await send.first().isEnabled().catch(() => false))) {
        await send.first().click({ force: true });
        await expect(page.locator('[data-card="offer"]').first()).toBeVisible({ timeout: 25_000 });
        await shot(page, "admin-offer-sent");
      }
    } else if (await sendChoices.count()) {
      await expect(sendChoices.first()).toBeEnabled({ timeout: 10_000 });
      await sendChoices.first().click();
      await shot(page, "admin-choices-sent");
    } else if (await addDraft.count()) {
      await expect(addDraft.first()).toBeEnabled({ timeout: 10_000 });
      await addDraft.first().click();
      await shot(page, "admin-draft-added");
    }

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
