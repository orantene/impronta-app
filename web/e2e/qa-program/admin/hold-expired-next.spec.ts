import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  prepareJourneysPage,
  requireClientLink,
  sendTimesCard,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

/**
 * Hold-expired next-step proof (D-MSG-301).
 *
 * Deep-links to a seeded inquiry whose professional_times payload has
 * holdExpiresAt in the past. Required: next-step title reads "Hold expired".
 * Companion: send a fresh times card (live hold) and assert the bar does NOT
 * say Hold expired — both directions required (no QA_HOLD_LIVE opt-in).
 */
const HOLD_EXPIRED_INQUIRY =
  process.env.QA_HOLD_EXPIRED_INQUIRY_ID ?? "195d4d01-1d63-456b-a6fa-9df523ab0bc9";
/** Confirmed identity, no expired hold cards — used to seed a live hold. */
const HOLD_LIVE_SEED_INQUIRY =
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

  test("live hold payload → next-step does NOT say Hold expired", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    // Seed on an inquiry with no expired hold cards (sendTimesCard alone does
    // not set holdExpiresAt — the client pick does).
    await sendTimesCard(page, 3, { inquiryId: HOLD_LIVE_SEED_INQUIRY });
    await expect(page.locator('[data-card="times"]').last()).toBeVisible({ timeout: 15_000 });

    const client = await requireClientLink(page, context);
    const pick = client
      .locator('[data-card="times"] button, [data-card] button')
      .filter({ hasText: /\d{1,2}:\d{2}|AM|PM/i })
      .first();
    await expect(
      pick,
      "client times card has no pickable slot after times send",
    ).toBeVisible({ timeout: 20_000 });
    await pick.click();
    await client.waitForTimeout(2000);
    await shot(client, "remain-hold-live-client-pick");
    await client.close().catch(() => undefined);

    await page.bringToFront();
    await page.waitForTimeout(2000);
    const next = page.locator("[data-next-step]");
    await expect(next.first(), "next-step bar missing after live client pick").toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-next-step][aria-busy="true"]')).toHaveCount(0, {
      timeout: 45_000,
    });
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

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
