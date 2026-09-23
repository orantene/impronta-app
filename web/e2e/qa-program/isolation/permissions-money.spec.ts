/**
 * Permissions — staff without money permission (Round 2).
 *
 * Messaging money keys are open-by-default until any staff_permissions row
 * opts the tenant in (D-MSG-40). This spec seeds `messages.refund` for the
 * owner only (service role), then signs in as a staff user without the grant
 * and asserts Refund refuses with a sentence.
 *
 * Request payment is NOT in MESSAGING_MONEY_PERMISSIONS (discount / refund /
 * cancel / close_lost / notes.read) — asserting on the payment tray would
 * false-fail while the tenant stays open-by-default.
 *
 * Without the service role, the test skips rather than soft-passing.
 */
import { createClient } from "@supabase/supabase-js";
import {
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openFirstInboxRow,
  openPlusTray,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

const STAFF_NO_MONEY_EMAIL =
  process.env.QA_STAFF_NO_MONEY_EMAIL ?? "qa-journeys-staff-nomoney@impronta.test";
const OWNER_PROFILE_ID = "33330001-0000-4000-8000-000000000001";

test.describe("QA permissions — money gate", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("staff without money permission sees refusal on Refund", async ({ page }) => {
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to opt the tenant into messages.* staff_permissions (D-MSG-40)",
    );

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    // Opt the tenant in: grant owner messages.refund; nomoney staff has none.
    const { error: grantErr } = await sb.from("staff_permissions").upsert(
      { user_id: OWNER_PROFILE_ID, permission: "messages.refund" },
      { onConflict: "user_id,permission" },
    );
    expect(grantErr, `staff_permissions upsert failed: ${grantErr?.message}`).toBeNull();

    // Prefer a thread that already shows Paid so the Refund door is present.
    const { data: paidRec } = await sb
      .from("conversation_records")
      .select("inquiry_id")
      .eq("tenant_id", "33333333-3333-4333-8333-333333333333")
      .eq("payment_state", "paid")
      .not("inquiry_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const paidInquiry = (paidRec as { inquiry_id?: string } | null)?.inquiry_id ?? null;

    const { errors } = attachConsoleGuard(page);
    const next = paidInquiry
      ? `/admin/messages?inquiry=${paidInquiry}`
      : "/admin/messages";
    await signInJourneysStaff(page, next, STAFF_NO_MONEY_EMAIL);
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);
    if (!paidInquiry) await openFirstInboxRow(page);

    // After tenant opt-in, non-holders should not get a Refund door (hidden)
    // or should see a refusal sentence if one is shown. Request payment stays
    // available — it is not a MESSAGING_MONEY_PERMISSIONS key.
    const refundBtn = page.getByRole("button", { name: /^refund$/i });
    const nextRefund = page.locator("[data-next-step-action]").filter({ hasText: /refund/i });
    const cardRefund = page
      .locator('[data-card="payment"]')
      .filter({ hasText: /paid/i })
      .getByRole("button", { name: /refund/i });

    const refundVisible =
      (await refundBtn.count()) + (await nextRefund.count()) + (await cardRefund.count()) > 0;

    if (refundVisible) {
      const target = (await refundBtn.first().isVisible().catch(() => false))
        ? refundBtn.first()
        : (await nextRefund.first().isVisible().catch(() => false))
          ? nextRefund.first()
          : cardRefund.first();
      await target.click();
      await expect(
        page.getByText(/not allowed|permission|cannot|don't have|do not have|refused/i).first(),
        "Refund must refuse without messages.refund after tenant opt-in",
      ).toBeVisible({ timeout: 20_000 });
    } else {
      // Hidden is the stronger product door: grant exists for owner, this staff
      // never sees Refund while Paid is still on the thread.
      await expect(
        page.locator('[data-card="payment"]').filter({ hasText: /paid/i }).first(),
        "expected a Paid payment card so a missing Refund door is meaningful",
      ).toBeVisible({ timeout: 15_000 });
      await expect(refundBtn, "Refund button must stay hidden for non-holders").toHaveCount(0);
      await openPlusTray(page);
      await expect(
        page.locator('[data-tray-item="payment"]').first(),
        "Request payment must remain available (not a money-permission key)",
      ).toBeVisible({ timeout: 10_000 });
    }
    await shot(page, "perm-no-money-refund");
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
