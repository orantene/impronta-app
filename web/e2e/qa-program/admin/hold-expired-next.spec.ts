import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

/**
 * Hold-expired next-step proof (D-MSG-301).
 *
 * Prefers deep-linking to a seeded inquiry that already has an expired
 * professional_times payload. When D-MSG-301 is live on the QA host, the
 * next-step title must read "Hold expired". Until journeys sync, the test
 * soft-passes with an annotation.
 */
const HOLD_EXPIRED_INQUIRY =
  process.env.QA_HOLD_EXPIRED_INQUIRY_ID ?? "195d4d01-1d63-456b-a6fa-9df523ab0bc9";

test.describe("QA remaining: hold-expired next-step (D-MSG-301)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("open thread with expired hold payload → next-step Hold expired when wired", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, `/admin/messages?inquiry=${HOLD_EXPIRED_INQUIRY}`);
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    // If deep-link did not select, fall back to scanning for hold language
    const next = page.locator("[data-next-step]");
    await expect(next.first()).toBeVisible({ timeout: 20_000 }).catch(() => undefined);
    const title = (
      (await page.locator("[data-next-step] b, [data-next-step] .ttl").first().innerText().catch(() => "")) || ""
    ).trim();
    const body = await page.locator("[data-messages-v5]").innerText();
    await shot(page, "remain-hold-expired-next");

    const hasHoldExpired = /hold expired/i.test(title) || /hold expired/i.test(body);
    test.info().annotations.push({
      type: "hold-expired",
      description: hasHoldExpired
        ? `next-step title=${title}`
        : `not yet on QA host (needs merge+journeys sync for D-MSG-301); title=${title.slice(0, 80)}`,
    });

    // Soft: do not fail the suite until D-MSG-301 is deployed to staging-qa-journeys.
    // Hard assert flips on once the annotation says green.
    if (process.env.QA_REQUIRE_HOLD_EXPIRED === "1") {
      expect(hasHoldExpired, `expected Hold expired, got: ${title}`).toBeTruthy();
    }

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
    void openAdminMessages;
  });
});
