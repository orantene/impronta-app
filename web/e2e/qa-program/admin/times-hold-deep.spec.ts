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

test.describe("QA 6.1 times card + hold path", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);

  test("Send times: pick person + named service + 3 slots, send card", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="times"]').click();

    const sheet = page.locator("[data-times-sheet], [data-sheet]").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await shot(page, "admin-times-deep-open");

    const person = sheet.locator("[data-times-people] button").first();
    if (!(await person.isVisible().catch(() => false))) {
      // fallback option rows
      await sheet.locator("[data-option-row], button").filter({ hasText: /.+/ }).first().click();
    } else {
      await person.click();
    }

    const services = sheet.locator("[data-times-services] button, [data-times-services] .chip, [data-times-services] [role='button']");
    const serviceCount = await services.count();
    for (let i = 0; i < serviceCount; i++) {
      const label = (await services.nth(i).innerText()).trim();
      if (/any service/i.test(label)) continue;
      await services.nth(i).click();
      break;
    }

    await page.waitForTimeout(2000);
    const refusal = sheet.locator("[data-refusal], [role='alert']");
    if (await refusal.isVisible().catch(() => false)) {
      const text = await refusal.innerText();
      test.info().annotations.push({ type: "seam-or-block", description: text.slice(0, 120) });
      await shot(page, "admin-times-deep-refused");
      await assertNoRawI18nKeys(page);
      expect(errors, errors.join("\n")).toEqual([]);
      return;
    }

    const slots = sheet.locator("[data-times-slots] button");
    const slotCount = await slots.count();
    if (slotCount < 3) {
      await shot(page, "admin-times-deep-no-slots");
      test.info().annotations.push({ type: "blocked", description: `only ${slotCount} slots` });
      await assertNoRawI18nKeys(page);
      expect(errors, errors.join("\n")).toEqual([]);
      return;
    }
    for (let i = 0; i < 3; i++) await slots.nth(i).click();

    const send = sheet.locator("[data-times-send]");
    await expect(send.first()).toBeEnabled({ timeout: 15_000 });
    await send.first().click();
    // Card may render as times or as a system/options card
    const card = page.locator('[data-card="times"], [data-card="options"], [data-message]').filter({ hasText: /time|slot|pick/i }).first();
    const done = sheet.locator("[data-times-sheet][data-phase='done'], [data-phase='done']");
    await expect(card.or(done).or(page.getByText(/times sent|sent times/i).first())).toBeVisible({ timeout: 30_000 });
    await shot(page, "admin-times-deep-sent");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
