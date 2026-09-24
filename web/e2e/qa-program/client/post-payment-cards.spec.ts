/**
 * Round 3 Job 6 (D-MSG-415) — post-payment cards on the client link.
 *
 * Required asserts only. Soft `if (visible)` is banned.
 * Live cash→Paid flip was proven on journeys (evidence/2026-09-24/job6-a6-paid-proof.txt).
 * This spec pins the Paid Payment card on a paid conversation_record; missing
 * order_confirmation / tickets_card / cancel change_result producers are
 * ledger seams, not soft-skipped asserts.
 */
import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  requireClientLink,
  shot,
  test,
} from "../_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../../cases/_isolated-db";

test.describe("QA post-payment cards (A6 / D-MSG-415)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(180_000);

  test("client link shows Paid payment card on a cash-settled thread", async ({ page, context }) => {
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY required");
    const { errors } = attachConsoleGuard(page);
    const sb = isolatedService();

    const { data: paidRec, error } = await sb
      .from("conversation_records")
      .select("inquiry_id, record_id, payment_state")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("payment_state", "paid")
      .eq("record_kind", "order")
      .is("unlinked_at", null)
      .not("inquiry_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(error, `conversation_records paid lookup failed: ${error?.message ?? ""}`).toBeNull();
    const inquiryId = (paidRec as { inquiry_id?: string } | null)?.inquiry_id;
    expect(inquiryId, "no paid conversation_records on journeys for A6").toBeTruthy();

    const { data: card, error: cardErr } = await sb
      .from("inquiry_messages")
      .select("id, card_payload")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("inquiry_id", inquiryId!)
      .eq("message_kind", "payment_request")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(cardErr, `payment_request lookup failed: ${cardErr?.message ?? ""}`).toBeNull();
    const state = (card as { card_payload?: { state?: string } } | null)?.card_payload?.state;
    expect(
      state,
      `payment_request card on ${inquiryId} must be paid (got ${state ?? "missing"}) — D-MSG-338/342 sync`,
    ).toBe("paid");

    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", inquiryId!);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    await expect(
      page.locator('[data-card="payment"]').filter({ hasText: /paid/i }).first(),
      "admin Paid payment card missing on paid thread",
    ).toBeVisible({ timeout: 25_000 });
    await shot(page, "a6-admin-paid-card");

    const client = await requireClientLink(page, context);
    const guard = attachConsoleGuard(client);
    await expect(client.locator("body")).toBeVisible();

    const paidPill = client
      .locator('[data-testid="client-pay"]')
      .filter({ hasText: /paid|pagado|payé/i })
      .first();
    await expect(paidPill, "client Payment card did not show Paid").toBeVisible({ timeout: 25_000 });
    await shot(client, "a6-client-paid-en");

    // ES locale: same card, Spanish Paid pill — required, not soft.
    const base = client.url().split("?")[0];
    await client.goto(`${base}?lang=es`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await client.waitForTimeout(800);
    await expect(
      client.locator('[data-testid="client-pay"]').filter({ hasText: /pagado/i }).first(),
      "client Payment card missing Pagado on ?lang=es",
    ).toBeVisible({ timeout: 20_000 });
    await shot(client, "a6-client-paid-es");
    await assertNoRawI18nKeys(client, "body");

    expect(guard.errors.filter((e) => !/hydration|ResizeObserver|favicon/i.test(e)), guard.errors.join("\n")).toEqual(
      [],
    );
    expect(errors.filter((e) => !/hydration|ResizeObserver|favicon/i.test(e)), errors.join("\n")).toEqual([]);
  });
});
