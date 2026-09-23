import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  requireClientLink,
  sendTimesCard,
  shot,
  test,
} from "../_harness";

const RACE_B = process.env.QA_DOUBLE_BOOK_B ?? "08f2a0b7-1312-4f17-9ec4-f154aaa2e502";

/**
 * Remaining deep: hold + confirm. Payment mint/outside live in payment-*.spec.ts.
 */
test.describe("QA remaining: hold expiry + confirm", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("times card: client picks a slot → admin sees hold", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await sendTimesCard(page, 3);

    const client = await requireClientLink(page, context);
    const pick = client
      .locator('[data-card="times"] button, [data-card] button')
      .filter({ hasText: /\d{1,2}:\d{2}|AM|PM/i })
      .first();
    await expect(
      pick,
      "client times card has no pickable slot button after times send",
    ).toBeVisible({ timeout: 20_000 });
    await pick.click();
    await client.waitForTimeout(1500);
    await shot(client, "remain-client-picked-time");

    await page.bringToFront();
    await page.waitForTimeout(2000);
    const body = await page.locator("[data-messages-v5]").innerText();
    expect(
      /hold|held|expir|waiting|min left/i.test(body),
      "admin thread does not show hold language after client picked a slot",
    ).toBeTruthy();
    await shot(page, "remain-admin-after-hold");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("confirm sheet opens from race-B times Confirm door", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", RACE_B);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const timesConfirm = page.locator('[data-times-action="confirm"]').first();
    await expect(
      timesConfirm,
      "Confirm door missing on race-B — seed picked professional_times (D-MSG-310)",
    ).toBeVisible({ timeout: 20_000 });
    await timesConfirm.click();
    await expect(
      page.locator("[data-confirm-sheet]").first(),
      "Confirm sheet did not open",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "remain-confirm-sheet");
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
