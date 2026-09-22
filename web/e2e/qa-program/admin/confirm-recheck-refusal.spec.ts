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
 * Confirm recheck refusal (Round 2).
 *
 * Seeded inquiry (Cora): accepted offer with talent "QA Journeys Talent",
 * reservation stamp overlapping a confirmed talent_bookings row on another
 * inquiry, confirmed identity, and a picked professional_times card so the
 * Confirm-time door exists (Confirm is not in the Plus tray — D-MSG-310).
 *
 * Assert: conflict sentence, no new appointment/project card, pending chips.
 */
const CONFIRM_REFUSAL_INQUIRY =
  process.env.QA_CONFIRM_REFUSAL_INQUIRY_ID ?? "c5150576-4be8-46bd-a1be-718e95da43a5";

test.describe("QA confirm recheck refusal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("confirm refuses when talent slot is taken — no record created", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const u = new URL(page.url());
    u.searchParams.set("inquiry", CONFIRM_REFUSAL_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const projectBefore = await page.locator('[data-card="appointment"], [data-card="project"]').count();
    const chipsBefore = ((await page.locator("[data-thread-header]").innerText()) || "").replace(/\s+/g, " ");

    // Door: picked Times card → Confirm time (not tray; Confirm is not a tray item).
    const timesConfirm = page.locator('[data-times-action="confirm"]').first();
    const orderConfirm = page.locator('[data-order-action="confirm"]').first();
    const nextConfirm = page.locator("[data-next-step-action]").filter({ hasText: /confirm/i }).first();
    if (await timesConfirm.isVisible().catch(() => false)) {
      await timesConfirm.click();
    } else if (await orderConfirm.isVisible().catch(() => false)) {
      await orderConfirm.click();
    } else if (await nextConfirm.isVisible().catch(() => false)) {
      await nextConfirm.click();
    } else {
      await expect(
        timesConfirm,
        "Confirm door missing — seed a picked professional_times card (data-times-action=confirm) on the refusal inquiry; Confirm is not in the Plus tray (D-MSG-310)",
      ).toBeVisible({ timeout: 5_000 });
    }

    const sheet = page.locator("[data-confirm-sheet]").first();
    await requireVisible(sheet, "Confirm sheet did not open after Confirm door click");
    await shot(page, "admin-confirm-recheck-open");

    // Accepted offer is the preferred source; click if the picker lists more than one.
    const sources = page.locator("[data-confirm-sources] button, [data-confirm-sources] [role='radio']");
    await expect(sources.first(), "Confirm source picker empty — accepted offer missing").toBeVisible({
      timeout: 15_000,
    });
    await sources.first().click();

    const primary = page.locator("[data-confirm-primary]").first();
    await requireVisible(primary, "Confirm primary missing");
    const override = page.locator("[data-confirm-override-input]").first();
    if (await override.isVisible().catch(() => false)) {
      await override.fill("QA recheck refusal seed override");
    }
    await expect(primary, "Confirm primary still disabled after source/override").toBeEnabled({
      timeout: 15_000,
    });
    await primary.click();

    // Effect: conflict phase with the engine's "no longer free" sentence.
    await expect(
      page.locator("[data-confirm-phase='conflict'], [data-confirm-conflicts]").first(),
      "Confirm did not enter conflict phase after recheck refusal",
    ).toBeVisible({ timeout: 25_000 });
    const conflict = page.locator("[data-confirm-conflict]").first();
    await requireVisible(conflict, "conflict row missing after recheck refusal");
    const why = ((await conflict.innerText()) || "").replace(/\s+/g, " ").trim();
    expect(
      why,
      `expected "no longer free" conflict sentence; got: ${why}`,
    ).toMatch(/no longer free|just taken|not available|busy/i);
    await shot(page, "admin-confirm-recheck-refused");

    // No new appointment/project card; header still pending (not Confirmed).
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const projectAfter = await page.locator('[data-card="appointment"], [data-card="project"]').count();
    expect(
      projectAfter,
      "confirm created a record despite recheck refusal",
    ).toBe(projectBefore);
    const chipsAfter = ((await page.locator("[data-thread-header]").innerText()) || "").replace(/\s+/g, " ");
    expect(
      /confirmed booking|appointment confirmed/i.test(chipsAfter),
      `thread left pending after refusal; chips were "${chipsBefore}" → "${chipsAfter}"`,
    ).toBeFalsy();

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
