import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

/**
 * Hold-expired next-step proof (D-MSG-301).
 *
 * Deep-links to a seeded inquiry whose professional_times payload has
 * holdExpiresAt in the past. Required: next-step title reads "Hold expired".
 * Companion assertion: a live-hold inquiry must NOT show that title.
 */
const HOLD_EXPIRED_INQUIRY =
  process.env.QA_HOLD_EXPIRED_INQUIRY_ID ?? "195d4d01-1d63-456b-a6fa-9df523ab0bc9";
const HOLD_LIVE_INQUIRY = process.env.QA_HOLD_LIVE_INQUIRY_ID ?? "";

test.describe("QA remaining: hold-expired next-step (D-MSG-301)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("expired hold payload → next-step reads Hold expired", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/messages?inquiry=${HOLD_EXPIRED_INQUIRY}`);
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });
    // Deep-link opens the seeded inquiry; wait for thread hydrate (not loading).
    const next = page.locator("[data-next-step]");
    await expect(next.first(), "next-step bar missing on expired-hold inquiry").toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator('[data-next-step][aria-busy="true"]'),
      "next-step stuck in loading (Working out the next step) — thread messages never hydrated",
    ).toHaveCount(0, { timeout: 45_000 });
    // Prefer title from non-loading bar; fall back to full next-step text.
    const title = (
      (await page.locator("[data-next-step] b, [data-next-step] .ttl").first().innerText()) ||
      (await next.first().innerText()) ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    await shot(page, "remain-hold-expired-next");

    expect(title, `expected next-step "Hold expired", got: ${title}`).toMatch(/hold expired/i);

    const action = page.locator("[data-next-step-action]").first();
    if (await action.count()) {
      const actionLabel = (await action.innerText()).trim();
      expect(
        actionLabel,
        `primary action should offer new times after hold expired; got: ${actionLabel}`,
      ).toMatch(/time|offer|send/i);
    }

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("live hold payload → next-step does NOT say Hold expired", async ({ page }) => {
    test.skip(
      !HOLD_LIVE_INQUIRY,
      "set QA_HOLD_LIVE_INQUIRY_ID to a seeded inquiry with holdExpiresAt in the future",
    );
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/messages?inquiry=${HOLD_LIVE_INQUIRY}`);
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    const next = page.locator("[data-next-step]");
    await expect(next.first(), "next-step bar missing on live-hold inquiry").toBeVisible({
      timeout: 20_000,
    });
    const title = (
      (await page.locator("[data-next-step] b, [data-next-step] .ttl").first().innerText()) || ""
    ).trim();
    await shot(page, "remain-hold-live-next");

    expect(title, `live hold must not read Hold expired; got: ${title}`).not.toMatch(
      /hold expired/i,
    );

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
