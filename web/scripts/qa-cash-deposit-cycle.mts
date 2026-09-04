/**
 * QA — deposit-first CASH cycle + instant-book pay-in-person seam (Phase 1).
 *
 * Lane A (1A): offer with 30% deposit terms → booking → CASH DEPOSIT settle →
 *   booking 'partial' + balance-due card → CASH BALANCE settle → 'paid'/
 *   'confirmed'. Snapshot stays cash/efectivo throughout; invariant holds;
 *   zero Stripe. Engine-level mirror of markInquiryPaidInCash (server actions
 *   need a request scope headless runs don't have).
 * Lane B (1B): instant-book payInPerson → txn drafts manual + snapshot cash at
 *   creation → requestPayment+markPaid settles it receiver-free.
 *
 * Run: set -a; source .env.local; set +a
 *      NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-cash-deposit-cycle.mts
 * Cleans up everything it creates (never touches other qa-client-1/2 rows).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { submitInquiry } from "../src/lib/inquiry/inquiry-engine-submit";
import { assignCoordinator } from "../src/lib/inquiry/inquiry-engine-coordinator";
import { createOffer, updateOfferDraft, sendOffer } from "../src/lib/inquiry/inquiry-engine-offers";
import { clientAcceptOffer, talentRespondToOffer } from "../src/lib/inquiry/inquiry-engine-approvals";
import { convertToBooking } from "../src/lib/inquiry/inquiry-engine-booking";
import { createInstantBooking } from "./qa-instant-book-compat";
import { persistBookingCommissionSnapshot } from "../src/lib/billing/commission-engine";
import { createBookingTransaction, requestPayment, markPaid, loadActiveBookingTransaction } from "../src/lib/bookings/transactions";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/"/g, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/"/g, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!.replace(/"/g, "");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const TENANT = "00000000-0000-0000-0000-000000000001";
const TALENT = "eb97dc64-af2b-4996-a48c-913a143cfa59"; // MORENA (talent-direct: no balance accrual)
const OFF_BRIDAL_TRIAL = "0f0e0001-0000-4000-8000-000000000001";

let FAILED = 0;
const ok = (n: string, c: unknown, e = "") => { console.log(`${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`); if (!c) { FAILED++; process.exitCode = 1; } };
const ver = async (id: string) => ((await admin.from("inquiries").select("version").eq("id", id).single()).data as { version: number }).version;
const over = async (id: string) => ((await admin.from("inquiry_offers").select("version").eq("id", id).single()).data as { version: number }).version;
const snapMethod = async (bk: string) => {
  const { data } = await admin.from("booking_commission_snapshot").select("payment_method,off_platform_reason").eq("booking_id", bk);
  return (data ?? []).map((r: { payment_method: string; off_platform_reason: string | null }) => `${r.payment_method}/${r.off_platform_reason ?? "-"}`).join(",");
};
const bookingPay = async (bk: string) => (await admin.from("agency_bookings").select("payment_status,status,deposit_amount_cents").eq("id", bk).single()).data as { payment_status: string; status: string; deposit_amount_cents: number | null };

async function cleanup(bookingId: string, inquiryId: string) {
  if (bookingId) {
    // Reverse any off-platform accrual THIS booking added before deleting its
    // movement rows (workspace-owned lanes accrue; talent-direct does not).
    const { data: mv } = await admin.from("platform_commission_movements").select("movement_type, amount_cents, currency_code").eq("booking_id", bookingId);
    const byCur: Record<string, number> = {};
    for (const m of (mv ?? []) as Array<{ movement_type: string; amount_cents: number; currency_code: string }>) {
      if (m.movement_type === "accrual") byCur[m.currency_code] = (byCur[m.currency_code] ?? 0) + Number(m.amount_cents);
    }
    if (Object.keys(byCur).length > 0) {
      const { data: balRow } = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle();
      const bc = { ...((balRow as { balances_cents?: Record<string, number> } | null)?.balances_cents ?? {}) };
      for (const [cur, cents] of Object.entries(byCur)) bc[cur] = Number(bc[cur] ?? 0) - cents;
      await admin.from("platform_commission_balances").update({ balances_cents: bc }).eq("tenant_id", TENANT);
    }
    for (const t of ["booking_payouts", "booking_transactions", "platform_commission_movements", "booking_commission_snapshot", "booking_talent", "booking_activity_log", "booking_fulfillments"]) {
      await admin.from(t).delete().eq("booking_id", bookingId);
    }
    await admin.from("agency_bookings").delete().eq("id", bookingId);
  }
  if (inquiryId) {
    await admin.from("user_notifications").delete().eq("origin_inquiry_id", inquiryId);
    await admin.from("agency_client_relationships").update({ first_inquiry_id: null }).eq("first_inquiry_id", inquiryId);
    for (const t of ["inquiry_approvals", "inquiry_messages", "inquiry_offer_line_items", "inquiry_offers", "inquiry_participants", "inquiry_events"]) {
      await admin.from(t).delete().eq("inquiry_id", inquiryId);
    }
    await admin.from("inquiries").delete().eq("id", inquiryId);
  }
}

/** Engine mirror of markInquiryPaidInCash step 2+3 for one checkout type. */
async function settleCash(bookingId: string, inquiryId: string, checkoutType: "deposit" | "balance" | "full", grossCents: number, feeCents: number, payerUserId: string) {
  const txn0 = await loadActiveBookingTransaction(bookingId, admin as never);
  if (!txn0) {
    const d = await createBookingTransaction({ bookingId, sourceTenantId: TENANT, sourceInquiryId: inquiryId, planTier: "agency", grossAmountCents: grossCents, platformFeeCentsOverride: feeCents, currency: "USD", payerUserId, checkoutType });
    if (!d.ok) throw new Error(`draft(${checkoutType}): ${d.error}`);
  }
  const txn = await loadActiveBookingTransaction(bookingId, admin as never);
  if (!txn) throw new Error("no active txn");
  if (txn.status === "draft") { const r = await requestPayment(txn.id); if (!r.ok) throw new Error(r.error); }
  const p = await markPaid(txn.id); if (!p.ok) throw new Error(p.error);
  return txn.id;
}

async function main() {
  console.log("=== Phase 1 QA: deposit-first cash cycle + instant-book seam ===\n");
  const clientSb: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: c, error: cErr } = await clientSb.auth.signInWithPassword({ email: "qa-client-1@impronta.test", password: "Impronta-QA-Client-2026!" });
  ok("client sign-in", !cErr && !!c?.user);
  const adminSb: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: a, error: aErr } = await adminSb.auth.signInWithPassword({ email: "qa-admin@impronta.test", password: "Impronta-QA-Admin-2026!" });
  ok("staff sign-in", !aErr && !!a?.user);
  const clientUser = c!.user!.id, staffUser = a!.user!.id;
  const { data: tp } = await admin.from("talent_profiles").select("user_id").eq("id", TALENT).single();
  const talentUser = (tp as { user_id: string }).user_id;

  // ── LANE A: offer with 30% deposit → cash deposit → cash balance ──
  console.log("\n── LANE A: deposit-first cash ──");
  let aInq = "", aBk = "";
  try {
    const sub = await submitInquiry(admin as never, { tenant_id: TENANT, contact_name: "QA Client One", contact_email: "qa-client-1@impronta.test", event_date: "2026-12-12", event_location: "CDMX", quantity: 1, message: "deposit-cash QA", source_channel: "public_talent_profile", client_user_id: clientUser, talent_profile_ids: [TALENT], actorUserId: clientUser, initiator_role: "client" } as never);
    aInq = (sub as { data: { inquiryId: string } }).data.inquiryId;
    await assignCoordinator(admin as never, { inquiryId: aInq, tenantId: TENANT, coordinatorUserId: staffUser, actorUserId: staffUser, expectedVersion: await ver(aInq) });
    const co = await createOffer(admin as never, { inquiryId: aInq, tenantId: TENANT, actorUserId: staffUser, expectedVersion: await ver(aInq), currencyCode: "USD" });
    const offerId = (co as { data: { offerId: string } }).data.offerId;
    const up = await updateOfferDraft(admin as never, {
      inquiryId: aInq, tenantId: TENANT, offerId, actorUserId: staffUser,
      inquiryExpectedVersion: await ver(aInq), offerExpectedVersion: await over(offerId),
      total_client_price: 1000, coordinator_fee: 0, currency_code: "USD", notes: "deposit-cash QA",
      lineItems: [{ talent_profile_id: TALENT, label: "Event day (travel incl.)", pricing_unit: "event", units: 1, unit_price: 1000, total_price: 1000, talent_cost: 800, notes: "", sort_order: 0 }],
      terms: { depositPct: 30, balanceMethod: "request_in_messages", refundPolicy: null },
    });
    ok("A. offer built with 30% deposit terms", (up as { success?: boolean }).success);
    await sendOffer(admin as never, { inquiryId: aInq, tenantId: TENANT, offerId, actorUserId: staffUser, inquiryExpectedVersion: await ver(aInq), offerExpectedVersion: await over(offerId) });
    await talentRespondToOffer(admin as never, { inquiryId: aInq, tenantId: TENANT, offerId, actorUserId: talentUser, expectedVersion: await ver(aInq), decision: "accepted" });
    await clientAcceptOffer(clientSb as never, { inquiryId: aInq, tenantId: TENANT, offerId, actorUserId: clientUser, expectedVersion: await ver(aInq) });
    const conv = await convertToBooking(adminSb as never, { inquiryId: aInq, tenantId: TENANT, actorUserId: staffUser, expectedVersion: await ver(aInq) });
    aBk = (conv as { data?: { bookingId?: string } }).data?.bookingId ?? "";
    ok("A. converted to booking", !!aBk, aBk);

    // Rail switch (mirror of the fixed reclassify: delete then persist as cash).
    await admin.from("booking_commission_snapshot").delete().eq("booking_id", aBk);
    const pc = await persistBookingCommissionSnapshot(admin as never, aBk, "cash", "efectivo");
    ok("A. snapshot reclassified to cash", pc.ok, await snapMethod(aBk));
    const { data: snaps } = await admin.from("booking_commission_snapshot").select("gross_charged_cents,platform_fee_cents,talent_net_cents,workspace_fee_cents").eq("booking_id", aBk);
    const gross = (snaps ?? []).reduce((s, r) => s + Number((r as { gross_charged_cents: number }).gross_charged_cents), 0);
    const fee = (snaps ?? []).reduce((s, r) => s + Number((r as { platform_fee_cents: number }).platform_fee_cents), 0);
    const tnet = (snaps ?? []).reduce((s, r) => s + Number((r as { talent_net_cents: number }).talent_net_cents), 0);
    const wfee = (snaps ?? []).reduce((s, r) => s + Number((r as { workspace_fee_cents: number }).workspace_fee_cents), 0);
    ok("A. MONEY INVARIANT holds", tnet + wfee + fee === gross, `${tnet}+${wfee}+${fee}=${gross}`);
    const bk0 = await bookingPay(aBk);
    const depositCents = Number(bk0.deposit_amount_cents ?? 0) > 0 ? Math.round(Number(bk0.deposit_amount_cents)) : Math.round(gross * 0.3);
    ok("A. booking carries deposit terms", depositCents > 0 && depositCents < gross, `deposit=${depositCents} gross=${gross}`);

    // CASH DEPOSIT
    const depositFee = Math.round(fee * (depositCents / gross));
    await settleCash(aBk, aInq, "deposit", depositCents, depositFee, clientUser);
    const bk1 = await bookingPay(aBk);
    ok("A. after CASH DEPOSIT: booking payment_status='partial'", bk1.payment_status === "partial", `payment_status=${bk1.payment_status}`);
    ok("A. snapshot still cash after deposit", (await snapMethod(aBk)).split(",").every((v) => v === "cash/efectivo"), await snapMethod(aBk));
    const { data: balCard } = await admin.from("inquiry_messages").select("message_kind").eq("inquiry_id", aInq).eq("message_kind", "balance_due");
    ok("A. balance-due card emitted to the thread", (balCard ?? []).length > 0, `${(balCard ?? []).length} card(s)`);

    // CASH BALANCE
    await settleCash(aBk, aInq, "balance", gross - depositCents, fee - depositFee, clientUser);
    const bk2 = await bookingPay(aBk);
    ok("A. after CASH BALANCE: booking 'paid'/'confirmed'", bk2.payment_status === "paid" && bk2.status === "confirmed", `payment_status=${bk2.payment_status} status=${bk2.status}`);
    ok("A. snapshot still cash at the end", (await snapMethod(aBk)).split(",").every((v) => v === "cash/efectivo"));
    const { data: txs } = await admin.from("booking_transactions").select("status,provider,provider_reference,payout_receiver_id,checkout_type").eq("booking_id", aBk).order("created_at");
    ok("A. both txns paid, manual, NO Stripe object, NO receiver",
      (txs ?? []).length === 2 && (txs ?? []).every((x: { status: string; provider: string; provider_reference: string | null; payout_receiver_id: string | null }) => x.status === "paid" && x.provider === "manual" && !x.provider_reference && !x.payout_receiver_id),
      (txs ?? []).map((x: { checkout_type: string; status: string }) => `${x.checkout_type}:${x.status}`).join(", "));
  } finally {
    await cleanup(aBk, aInq);
    const { data: gone } = await admin.from("inquiries").select("id").eq("id", aInq).maybeSingle();
    ok("A. cleanup verified", !gone);
  }

  // ── LANE B: instant-book payInPerson settles receiver-free (1B seam) ──
  console.log("\n── LANE B: instant-book pay-in-person seam ──");
  let bInq = "", bBk = "";
  try {
    const r = await createInstantBooking(clientSb as never, {
      tenantId: TENANT, talentProfileId: TALENT, clientUserId: clientUser, actorUserId: clientUser,
      contactName: "QA Client One", contactEmail: "qa-client-1@impronta.test", sourcePage: "/t/TAL-AUDIT-0512",
      currencyCode: "EUR", offeringId: OFF_BRIDAL_TRIAL, payInPerson: true,
    } as never);
    const rr = r as { ok: boolean; bookingId?: string; inquiryId?: string; reason?: string };
    ok("B. instant-book payInPerson created", rr.ok, rr.ok ? `booking ${rr.bookingId}` : rr.reason ?? "");
    if (rr.ok) {
      bBk = rr.bookingId!; bInq = rr.inquiryId!;
      ok("B. snapshot is cash AT CREATION (instant-book stamps the rail)", (await snapMethod(bBk)).startsWith("cash/"), await snapMethod(bBk));
      const txn = await loadActiveBookingTransaction(bBk, admin as never);
      ok("B. txn drafted manual", !!txn && txn.status === "draft" && txn.provider === "manual", `status=${txn?.status}`);
      if (txn) {
        const rq = await requestPayment(txn.id); ok("B. requestPayment WITHOUT receiver (rail-aware)", rq.ok, rq.ok ? "" : rq.error);
        const pd = await markPaid(txn.id); ok("B. reserve markPaid ok", pd.ok, pd.ok ? "" : pd.error);
        // Instant-book drafts a 30% DEPOSIT reserve (W2-A) — settling it makes
        // the booking 'partial' by design; the balance settles it fully.
        const bk = await bookingPay(bBk);
        ok("B. after reserve: booking 'partial' (deposit reserve model)", bk.payment_status === "partial", `payment_status=${bk.payment_status}`);
        const { data: bs } = await admin.from("booking_commission_snapshot").select("gross_charged_cents,platform_fee_cents").eq("booking_id", bBk);
        const bGross = (bs ?? []).reduce((s2, r2) => s2 + Number((r2 as { gross_charged_cents: number }).gross_charged_cents), 0);
        const bFee = (bs ?? []).reduce((s2, r2) => s2 + Number((r2 as { platform_fee_cents: number }).platform_fee_cents), 0);
        const paidSoFar = txn.grossAmountCents;
        await settleCash(bBk, bInq, "balance", bGross - paidSoFar, Math.max(0, bFee - Math.round(bFee * (paidSoFar / bGross))), clientUser);
        const bk2 = await bookingPay(bBk);
        ok("B. after CASH BALANCE: booking settles 'paid'", bk2.payment_status === "paid", `payment_status=${bk2.payment_status}`);
      }
    }
  } finally {
    await cleanup(bBk, bInq);
    ok("B. cleanup verified", !((await admin.from("agency_bookings").select("id").eq("id", bBk).maybeSingle()).data));
  }

  console.log(`\n=== ${FAILED === 0 ? "PASS — deposit-first cash + instant-book seam proven ✅" : `FAIL — ${FAILED} assertion(s) ❌`} ===`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
