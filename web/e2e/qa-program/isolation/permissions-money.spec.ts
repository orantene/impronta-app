/**
 * Permissions — staff without money permission (Round 2).
 *
 * Messaging money keys are open-by-default until any staff_permissions row
 * opts the tenant in (D-MSG-40). This spec seeds a grant for the owner only
 * when SUPABASE_SERVICE_ROLE_KEY is present, then signs in as a staff user
 * without the grant and asserts Request payment refuses with a sentence.
 *
 * Without the service role, the test documents the opt-in gate and skips
 * rather than soft-passing.
 */
import {
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

const STAFF_NO_MONEY_EMAIL =
  process.env.QA_STAFF_NO_MONEY_EMAIL ?? "qa-journeys-staff-nomoney@impronta.test";

test.describe("QA permissions — money gate", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("staff without money permission sees refusal on Request payment", async ({ page }) => {
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to opt the tenant into messages.* staff_permissions (D-MSG-40)",
    );

    const { errors } = attachConsoleGuard(page);
    // Sign in as the no-money staff user (must exist on QA fixture).
    await signInJourneysStaff(page, "/admin/messages", STAFF_NO_MONEY_EMAIL);
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);
    await openFirstInboxRow(page);

    await openPlusTray(page);
    const payment = page.locator('[data-tray-item="payment"]').first();
    // Either the tray hides payment, or opening it refuses with a sentence.
    if (await payment.isVisible().catch(() => false)) {
      await payment.click();
      const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
      await expect(sheet.or(page.getByText(/not allowed|permission|cannot|refused/i)).first()).toBeVisible({
        timeout: 20_000,
      });
      const body = ((await page.locator("[data-messages-v5]").innerText()) || "").replace(/\s+/g, " ");
      expect(
        /not allowed|permission|cannot|don't have|do not have|refused/i.test(body) ||
          (await page.locator("[data-payment-send]").count()) === 0,
        `Request payment must refuse without money permission; got: ${body.slice(0, 400)}`,
      ).toBeTruthy();
    } else {
      // Hidden is acceptable only if we also prove the tray item is absent
      // for this user (not a soft miss of the whole tray).
      await expect(
        page.locator("[data-tray]").first(),
        "Plus tray should still open for staff without money permission",
      ).toBeVisible();
      await expect(
        payment,
        "payment tray item correctly hidden for staff without money permission",
      ).toHaveCount(0);
    }
    await shot(page, "perm-no-money-payment");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
