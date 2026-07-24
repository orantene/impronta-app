/**
 * DEFINITIVE deposit/cash/wire variation pass, WITH the new balance guard.
 * Proper setup this time: deposit terms go through updateOfferDraft(terms) so
 * deposit_amount_cents is derived server-side exactly like the offer editor.
 *
 * Asserts, in order:
 *  0. offer terms derive deposit_amount_cents; convert carries BOTH pct+cents
 *  1. balance-BEFORE-deposit is REFUSED (the new guard)
 *  2. cash deposit ($180) -> booking partial
 *  3. second deposit attempt -> no double charge (exactly one paid deposit)
 *  4. balance in WIRE -> booking paid (off-platform method mix allowed)
 *  5. re-settle when paid -> safe no-op
 *  6. invariant + all manual rail + no receivers
 *  7. full cleanup incl. accrual reversal per currency (balances back to baseline)
 */
import { createClient } from "@supabase/supabase-js";
import { submitInquiry } from "../src/lib/inquiry/inquiry-engine-submit";
import { assignCoordinator } from "../src/lib/inquiry/inquiry-engine-coordinator";
import { createOffer, updateOfferDraft, sendOffer } from "../src/lib/inquiry/inquiry-engine-offers";
import { clientAcceptOffer, talentRespondToOffer } from "../src/lib/inquiry/inquiry-engine-approvals";
import { convertToBooking } from "../src/lib/inquiry/inquiry-engine-booking";
import { createBookingTransaction, requestPayment, markPaid, loadActiveBookingTransaction } from "../src/lib/bookings/transactions";
import { persistBookingCommissionSnapshot } from "../src/lib/billing/commission-engine";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/"/g, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/"/g, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!.replace(/"/g, "");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const TENANT = "00000000-0000-0000-0000-000000000001";
const MORE = "1d6bcec0-874d-427d-90ce-9f9c8f0e8929";

let FAILED = 0;
const ok = (n: string, c: unknown, e = "") => { console.log(`${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`); if (!c) { FAILED++; process.exitCode = 1; } };
const ver = async (id: string) => ((await admin.from("inquiries").select("version").eq("id", id).single()).data as { version: number }).version;
const over = async (id: string) => ((await admin.from("inquiry_offers").select("version").eq("id", id).single()).data as { version: number }).version;

async function settle(BK: string, INQ: string, payer: string, method: string, reason: string, checkoutType: "deposit" | "balance" | "full") {
  await admin.from("booking_commission_snapshot").delete().eq("booking_id", BK);
  await persistBookingCommissionSnapshot(admin as never, BK, method as never, reason);
  let txn = await loadActiveBookingTransaction(BK, admin as never);
  if (txn && txn.status === "paid") return { ok: true as const };
  if (!txn || txn.checkoutType !== checkoutType) {
    const { data: bkRow } = await admin.from("agency_bookings").select("deposit_amount_cents, total_client_revenue").eq("id", BK).single();
    const grossAll = Math.round(Number((bkRow as { total_client_revenue: number }).total_client_revenue) * 100);
    const dep = Math.round(Number((bkRow as { deposit_amount_cents: number | null }).deposit_amount_cents ?? 0));
    const amount = checkoutType === "deposit" ? dep : checkoutType === "balance" ? grossAll - dep : grossAll;
    const d = await createBookingTransaction({ bookingId: BK, sourceTenantId: TENANT, sourceInquiryId: INQ, planTier: "agency", grossAmountCents: amount, currency: "USD", payerUserId: payer, checkoutType });
    if (!d.ok) return { ok: false as const, error: (d as { error: string }).error };
    txn = await loadActiveBookingTransaction(BK, admin as never);
  }
  if (!txn) return { ok: false as const, error: "no txn" };
  if (txn.status === "draft") { const r = await requestPayment(txn.id); if (!r.ok) return { ok: false as const, error: r.error }; }
  const p = await markPaid(txn.id);
  return p.ok ? { ok: true as const } : { ok: false as const, error: p.error };
}

async function main() {
  console.log("=== Deposit variations (with balance guard) ===\n");
  const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: c } = await clientSb.auth.signInWithPassword({ email: "qa-client-1@impronta.test", password: "Impronta-QA-Client-2026!" });
  const clientUser = c!.user!.id;
  const adminSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: a } = await adminSb.auth.signInWithPassword({ email: "qa-admin@impronta.test", password: "Impronta-QA-Admin-2026!" });
  const staffUser = a!.user!.id;

  // baseline balances for the leak check at the end
  const balances = async () => JSON.stringify(((await admin.from("platform_commission_balances").select("tenant_id, balances_cents").eq("tenant_id", TENANT).maybeSingle()).data as { balances_cents?: Record<string, number> } | null)?.balances_cents ?? {});
  const balancesBefore = await balances();

  // ── setup: inquiry -> offer WITH terms.depositPct=30 (the editor's path) ──
  const sub = await submitInquiry(admin as never, { tenant_id: TENANT, contact_name: "QA Client One", contact_email: "qa-client-1@impronta.test", event_date: "2026-09-12", event_location: "Tulum", quantity: 1, message: "deposit guard variation", source_channel: "directory_client", client_user_id: clientUser, talent_profile_ids: [MORE], actorUserId: clientUser, initiator_role: "client" } as never);
  const INQ = (sub as { data: { inquiryId: string } }).data.inquiryId;
  await assignCoordinator(admin as never, { inquiryId: INQ, tenantId: TENANT, coordinatorUserId: staffUser, actorUserId: staffUser, expectedVersion: await ver(INQ) });
  const co = await createOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, actorUserId: staffUser, expectedVersion: await ver(INQ), currencyCode: "USD" });
  const offerId = (co as { data: { offerId: string } }).data.offerId;
  const upd = await updateOfferDraft(admin as never, {
    inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: staffUser,
    inquiryExpectedVersion: await ver(INQ), offerExpectedVersion: await over(offerId),
    total_client_price: 600, coordinator_fee: 0, currency_code: "USD", notes: "guard QA",
    lineItems: [{ talent_profile_id: MORE, label: "Guard QA event", pricing_unit: "event", units: 1, unit_price: 600, total_price: 600, talent_cost: 480, notes: "", sort_order: 0 }],
    terms: { depositPct: 30, balanceMethod: "request_in_messages" as never, refundPolicy: null },
  } as never);
  ok("setup: updateOfferDraft with terms.depositPct=30", (upd as { success?: boolean }).success !== false);
  const { data: offRow } = await admin.from("inquiry_offers").select("deposit_pct, deposit_amount_cents").eq("id", offerId).single();
  ok("0. offer derives deposit_amount_cents server-side", Number((offRow as { deposit_amount_cents: number }).deposit_amount_cents) === 18000, JSON.stringify(offRow));

  await sendOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: staffUser, inquiryExpectedVersion: await ver(INQ), offerExpectedVersion: await over(offerId) });
  const { data: tp } = await admin.from("talent_profiles").select("user_id").eq("id", MORE).single();
  await talentRespondToOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: (tp as { user_id: string }).user_id, expectedVersion: await ver(INQ), decision: "accepted" });
  await clientAcceptOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: clientUser, expectedVersion: await ver(INQ) });
  const conv = await convertToBooking(adminSb as never, { inquiryId: INQ, tenantId: TENANT, actorUserId: staffUser, expectedVersion: await ver(INQ) });
  const BK = (conv as { data?: { bookingId?: string } }).data?.bookingId ?? "";
  const { data: bkRow } = await admin.from("agency_bookings").select("deposit_pct, deposit_amount_cents").eq("id", BK).single();
  ok("0. booking carries pct=30 AND cents=18000", !!BK && Number((bkRow as { deposit_amount_cents: number }).deposit_amount_cents) === 18000, `${BK} ${JSON.stringify(bkRow)}`);

  // ── 1. balance BEFORE deposit → the new guard must refuse ──
  const early = await settle(BK, INQ, clientUser, "cash", "efectivo", "balance");
  ok("1. balance-before-deposit REFUSED by the guard", !early.ok && /deposit first/i.test(early.error ?? ""), early.ok ? "accepted (BUG)" : early.error);
  const st1 = (await admin.from("agency_bookings").select("payment_status").eq("id", BK).single()).data as { payment_status: string };
  ok("   booking still unpaid", st1.payment_status === "unpaid", st1.payment_status);

  // ── 2. cash deposit → partial ──
  const dep = await settle(BK, INQ, clientUser, "cash", "efectivo", "deposit");
  ok("2. cash deposit ($180) settles", dep.ok, dep.ok ? "" : dep.error);
  const st2 = (await admin.from("agency_bookings").select("payment_status").eq("id", BK).single()).data as { payment_status: string };
  ok("   booking = partial", st2.payment_status === "partial", st2.payment_status);

  // ── 3. second deposit → REFUSED by the duplicate guard ──
  const dup = await settle(BK, INQ, clientUser, "cash", "efectivo", "deposit");
  ok("3. duplicate deposit REFUSED", !dup.ok && /already collected/i.test(dup.error ?? ""), dup.ok ? "accepted (BUG)" : dup.error);
  const { data: depTxns } = await admin.from("booking_transactions").select("id").eq("booking_id", BK).eq("checkout_type", "deposit").eq("status", "paid");
  ok("   exactly ONE paid deposit txn", (depTxns ?? []).length === 1, `count=${(depTxns ?? []).length}`);

  // ── 4. balance in WIRE → paid ──
  const bal = await settle(BK, INQ, clientUser, "wire", "wire_transfer", "balance");
  ok("4. balance in WIRE settles after deposit", bal.ok, bal.ok ? "" : bal.error);
  const st4 = (await admin.from("agency_bookings").select("payment_status, status").eq("id", BK).single()).data as { payment_status: string; status: string };
  ok("   booking PAID + confirmed", st4.payment_status === "paid" && st4.status === "confirmed", JSON.stringify(st4));

  // ── 5. re-settle → safe no-op ──
  const again = await settle(BK, INQ, clientUser, "wire", "wire_transfer", "balance");
  ok("5. re-settle when paid is a safe no-op", again.ok === true);

  // ── 6. money truth ──
  const { data: snaps } = await admin.from("booking_commission_snapshot").select("talent_net_cents, workspace_fee_cents, platform_fee_cents, gross_charged_cents").eq("booking_id", BK);
  const sum = (k: string) => (snaps ?? []).reduce((s, r) => s + Number((r as Record<string, number>)[k]), 0);
  ok("6. invariant holds", sum("talent_net_cents") + sum("workspace_fee_cents") + sum("platform_fee_cents") === sum("gross_charged_cents"), `${sum("talent_net_cents")}+${sum("workspace_fee_cents")}+${sum("platform_fee_cents")}=${sum("gross_charged_cents")}`);
  const { data: txns } = await admin.from("booking_transactions").select("provider, status, checkout_type, payout_receiver_id, gross_amount_cents").eq("booking_id", BK).order("created_at");
  ok("6. all txns manual + receiver-free", (txns ?? []).every((t) => (t as { provider: string }).provider !== "stripe" && (t as { payout_receiver_id: unknown }).payout_receiver_id === null),
     (txns ?? []).filter((t) => (t as { status: string }).status === "paid").map((t) => `${(t as { checkout_type: string }).checkout_type}:$${Number((t as { gross_amount_cents: number }).gross_amount_cents) / 100}`).join(" "));
  const paidSum = (txns ?? []).filter((t) => (t as { status: string }).status === "paid").reduce((s, t) => s + Number((t as { gross_amount_cents: number }).gross_amount_cents), 0);
  // Off-platform lanes collect the OFFER TOTAL from the client (deposit+balance
  // = total_client_revenue); the snapshot's gross includes the card-lane client
  // fee, which cash does not collect (the platform fee accrues from the
  // workspace instead).
  const { data: bkFinal } = await admin.from("agency_bookings").select("total_client_revenue").eq("id", BK).single();
  const expected = Math.round(Number((bkFinal as { total_client_revenue: number }).total_client_revenue) * 100);
  ok("6. paid txns sum to the full offer total (no under-collection)", paidSum === expected, `${paidSum} vs ${expected}`);

  // ── 7. cleanup: THIS booking + the two earlier test bookings, movements-first, balance-preserving ──
  console.log("\n── cleanup ──");
  const targets: Array<[string, string]> = [
    [BK, INQ],
    ["46884948-a61b-4c48-b000-9e7923dc809e", "d6029e8e-7eb2-4f17-a710-fc577aecdcac"],
    ["8f82af13-fbe6-42d6-8ed8-ac9dae9b26c1", "795eaf9f-c776-4e22-ba5c-0caf81a59664"],
  ];
  for (const [bkId, inqId] of targets) {
    // reverse any accrual movements for this booking per currency BEFORE deleting them
    const { data: mv } = await admin.from("platform_commission_movements").select("amount_cents, currency_code, movement_type").eq("booking_id", bkId);
    for (const m of mv ?? []) {
      if ((m as { movement_type: string }).movement_type !== "accrual") continue;
      const cur = (m as { currency_code: string }).currency_code;
      const amt = Number((m as { amount_cents: number }).amount_cents);
      const { data: balRow } = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).single();
      const bals = ((balRow as { balances_cents: Record<string, number> }).balances_cents) ?? {};
      bals[cur] = Number(bals[cur] ?? 0) - amt;
      await admin.from("platform_commission_balances").update({ balances_cents: bals }).eq("tenant_id", TENANT);
    }
    for (const t of ["booking_payouts", "booking_transactions", "platform_commission_movements", "booking_commission_snapshot", "booking_talent", "booking_activity_log"]) {
      await admin.from(t).delete().eq("booking_id", bkId);
    }
    await admin.from("agency_bookings").delete().eq("id", bkId);
    await admin.from("user_notifications").delete().eq("origin_inquiry_id", inqId);
    await admin.from("agency_client_relationships").update({ first_inquiry_id: null }).eq("first_inquiry_id", inqId);
    for (const t of ["inquiry_approvals", "inquiry_messages", "inquiry_offer_line_items", "inquiry_offers", "inquiry_participants", "inquiry_events"]) {
      await admin.from(t).delete().eq("inquiry_id", inqId);
    }
    await admin.from("inquiries").delete().eq("id", inqId);
    console.log("   cleaned", bkId.slice(0, 8));
  }
  const balancesAfter = await balances();
  ok("7. platform balance back to pre-run value", balancesAfter === balancesBefore, `${balancesBefore} -> ${balancesAfter}`);

  console.log(`\n=== ${FAILED === 0 ? "PASS — all deposit/cash/wire variations + guard hold ✅" : `FAIL — ${FAILED} assertion(s) ❌`} ===`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
