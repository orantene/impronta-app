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
 * Both directions deep-link to seeded inquiries whose professional_times
 * payloads carry holdExpiresAt in the past vs future. `latestHoldExpiresAt`
 * picks the chronologically latest expiry across cards — a failed client pick
 * that leaves holdExpiresAt null on a new "sent" card still loses to an older
 * expired selected card, so the live direction must seed a future expiry
 * (not hope a client pick sticks).
 */
const HOLD_EXPIRED_INQUIRY =
  process.env.QA_HOLD_EXPIRED_INQUIRY_ID ?? "195d4d01-1d63-456b-a6fa-9df523ab0bc9";
/** Selected times card with holdExpiresAt in the future (seed / SQL bump). */
const HOLD_LIVE_INQUIRY =
  process.env.QA_HOLD_LIVE_INQUIRY_ID ?? "45a9b17e-63ec-4254-929a-4c67cb0b4e47";

test.describe("QA remaining: hold-expired next-step (D-MSG-301)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("expired hold payload → next-step reads Hold expired", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/messages?inquiry=${HOLD_EXPIRED_INQUIRY}`);
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });
    const next = page.locator("[data-next-step]");
    await expect(next.first(), "next-step bar missing on expired-hold inquiry").toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator('[data-next-step][aria-busy="true"]'),
      "next-step stuck in loading (Working out the next step) — thread messages never hydrated",
    ).toHaveCount(0, { timeout: 45_000 });

    // Lost short-circuits deriveTasks before Hold expired (D-MSG-304). Reopen if needed.
    const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
    if (await reopen.isVisible().catch(() => false)) {
      await reopen.click();
      await page.waitForTimeout(1500);
      await expect(page.locator('[data-next-step][aria-busy="true"]')).toHaveCount(0, {
        timeout: 20_000,
      });
    }

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
    await expect(action, "primary next-step action missing after Hold expired").toBeVisible({
      timeout: 10_000,
    });
    const actionLabel = (await action.innerText()).trim();
    expect(
      actionLabel,
      `primary action should offer new times after hold expired; got: ${actionLabel}`,
    ).toMatch(/time|offer|send/i);

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("live hold payload → next-step does NOT say Hold expired", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/messages?inquiry=${HOLD_LIVE_INQUIRY}`);
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });
    const next = page.locator("[data-next-step]");
    await expect(next.first(), "next-step bar missing on live-hold inquiry").toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-next-step][aria-busy="true"]')).toHaveCount(0, {
      timeout: 45_000,
    });

    const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
    if (await reopen.isVisible().catch(() => false)) {
      await reopen.click();
      await page.waitForTimeout(1500);
      await expect(page.locator('[data-next-step][aria-busy="true"]')).toHaveCount(0, {
        timeout: 20_000,
      });
    }

    // Prerequisite: a times card must be present so the live hold is not vacuum.
    await expect(
      page.locator('[data-card="times"]').first(),
      "live-hold inquiry has no times card — seed selected professional_times with future holdExpiresAt",
    ).toBeVisible({ timeout: 15_000 });

    const title = (
      (await page.locator("[data-next-step] b, [data-next-step] .ttl").first().innerText()) ||
      (await next.first().innerText()) ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    await shot(page, "remain-hold-live-next");

    expect(title, `live hold must not read Hold expired; got: ${title}`).not.toMatch(
      /hold expired/i,
    );
    // Positive: live hold should still be working a next step (not Lost alone).
    expect(title.length, "next-step title empty on live-hold inquiry").toBeGreaterThan(0);

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
