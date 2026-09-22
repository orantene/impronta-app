import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  requireVisible,
  shot,
  test,
} from "../_harness";

/**
 * Double-book refusal (Round 2) — sequential "slot already taken" half.
 *
 * Inquiry B shares talent + window with a confirmed talent_bookings row from
 * another inquiry. Confirm must refuse with "no longer free" and create no
 * appointment card.
 *
 * Concurrent TOCTOU (both contexts win) is D-MSG-312 — filed from QA action
 * logs 2026-09-22 21:24Z; fix is convert/recheck locking, not this sheet.
 */
const RACE_B = process.env.QA_DOUBLE_BOOK_B ?? "08f2a0b7-1312-4f17-9ec4-f154aaa2e502";

test.describe("QA Messages double-book refusal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("confirm refuses when the same slot is already booked — no second record", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const u = new URL(page.url());
    u.searchParams.set("inquiry", RACE_B);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const projectBefore = await page.locator('[data-card="appointment"], [data-card="appointment_confirmation"]').count();

    const timesConfirm = page.locator('[data-times-action="confirm"]').first();
    await requireVisible(
      timesConfirm,
      "Confirm door missing — seed picked professional_times on race-B inquiry (D-MSG-310)",
    );
    await timesConfirm.click();
    await requireVisible(page.locator("[data-confirm-sheet]").first(), "Confirm sheet did not open");
    await shot(page, "admin-double-book-b-ready");

    const sources = page.locator("[data-confirm-sources] button, [data-confirm-sources] [role='radio']");
    await expect(sources.first(), "Confirm source picker empty").toBeVisible({ timeout: 15_000 });
    await sources.first().click();
    const primary = page.locator("[data-confirm-primary]").first();
    await requireVisible(primary, "Confirm primary missing");
    const override = page.locator("[data-confirm-override-input]").first();
    if (await override.isVisible().catch(() => false)) {
      await override.fill("QA double-book loser override");
    }
    await expect(primary, "Confirm primary still disabled").toBeEnabled({ timeout: 15_000 });
    await primary.click();

    await expect(
      page.locator("[data-confirm-phase='conflict'], [data-confirm-conflicts]").first(),
      "Confirm did not enter conflict phase for an already-booked slot",
    ).toBeVisible({ timeout: 40_000 });
    const conflict = page.locator("[data-confirm-conflict]").first();
    await requireVisible(conflict, "conflict row missing");
    const why = ((await conflict.innerText()) || "").replace(/\s+/g, " ").trim();
    expect(why, `expected "no longer free"; got: ${why}`).toMatch(
      /no longer free|just taken|not available|busy/i,
    );
    await shot(page, "admin-double-book-b-refused");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const projectAfter = await page.locator('[data-card="appointment"], [data-card="appointment_confirmation"]').count();
    expect(
      projectAfter,
      "confirm created a record despite double-book refusal",
    ).toBe(projectBefore);

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
