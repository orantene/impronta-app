/**
 * QA — OFFER → BOOKING → CASH (efectivo) settle E2E, over the REAL money rail
 * (pre-launch prod DB). Proves the off-platform cash cycle end to end.
 *
 * Two lanes, both driving the OFFER path (NOT instant-book):
 *   client submitInquiry → coordinator createOffer + updateOfferDraft (USD) +
 *   sendOffer → talent + client accept → coordinator convertToBooking → settle CASH.
 *
 *   • Lane A — the PINNED talent MORENA (eb97dc64). On impronta MORENA has no
 *     active roster row, so the offer routes TALENT-DIRECT (owning_party='talent').
 *     Full cycle to markPaid: proves booking → paid/confirmed, snapshot invariant,
 *     payment_method='cash', no Stripe object, zero Stripe transfers.
 *   • Lane B — MORENA made WORKSPACE-owned via a temporary active roster row +
 *     a non-hub channel. Proves the off-platform WORKSPACE path: talent protected
 *     at the offered net, workspace margin, and the platform take ACCRUING to the
 *     workspace's off-platform balance (movement + balance bump).
 *
 * All engine functions are imported and driven headless via the server-only shim
 * (exactly like scripts/qa-offerings-e2e.mts). Coordinator steps run service-role
 * with an explicit staff actor (validateActorPermission is the security boundary;
 * super_admin bypass authorizes). convertToBooking's RPC gates on auth.uid()==actor
 * so it runs on the staff coordinator's REAL session. The client's own RLS session
 * cannot fan out participant rows, so submit runs service-role with actor=client.
 *
 * FINDINGS surfaced by this harness (see the ❌/⚠️ lines + the final report):
 *   F1 (A3) — the tenant auto-resolves coordinator_id to the priced talent's OWN
 *             user, forbidding the whole offer flow. We reassign to a staff coord.
 *   F2      — the cash transaction's payment_requested transition is gated on a
 *             payout_receiver_id (FK → payout_accounts) even for off-platform cash.
 *
 * Cleanup deletes ONLY what each lane created (its inquiry + booking children +
 * the temp receiver account + the temp roster row). Never touches anything else
 * belonging to qa-client-1 / qa-client-2.
 *
 * Run: set -a; source .env.local; set +a; \
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-cash-cycle-e2e.mts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { submitInquiry } from "../src/lib/inquiry/inquiry-engine-submit";
import { assignCoordinator } from "../src/lib/inquiry/inquiry-engine-coordinator";
import { createOffer, updateOfferDraft, sendOffer } from "../src/lib/inquiry/inquiry-engine-offers";
import { clientAcceptOffer, talentRespondToOffer } from "../src/lib/inquiry/inquiry-engine-approvals";
import { convertToBooking } from "../src/lib/inquiry/inquiry-engine-booking";
import { persistBookingCommissionSnapshot } from "../src/lib/billing/commission-engine";
import {
  createBookingTransaction,
  requestPayment,
  markPaid,
  setTransactionPayoutReceiver,
} from "../src/lib/bookings/transactions";
import { isOffPlatformPaymentMethod } from "../src/lib/billing/commission";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT = "00000000-0000-0000-0000-000000000001"; // impronta
const MORENA_TALENT = "eb97dc64-af2b-4996-a48c-913a143cfa59"; // QA Talent Dashboard Audit (no payout account)
const TEMP_RECEIVER_NAME = "QA cash-cycle temp receiver (auto-cleaned)";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let FAILED = 0;
function ok(name: string, cond: unknown, extra = ""): boolean {
  const pass = Boolean(cond);
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!pass) {
    FAILED += 1;
    process.exitCode = 1;
  }
  return pass;
}
function info(msg: string) {
  console.log(`   · ${msg}`);
}

async function inqVersion(inquiryId: string): Promise<number> {
  const { data } = await admin.from("inquiries").select("version").eq("id", inquiryId).maybeSingle();
  return Number((data as { version?: number } | null)?.version ?? 0);
}
async function offerVersion(offerId: string): Promise<number> {
  const { data } = await admin.from("inquiry_offers").select("version").eq("id", offerId).maybeSingle();
  return Number((data as { version?: number } | null)?.version ?? 0);
}

type Ctx = {
  clientSb: SupabaseClient;
  clientUserId: string;
  adminSb: SupabaseClient;
  coordinatorUserId: string;
  talentUserId: string;
};

/**
 * Drive the OFFER path from submit through convertToBooking. Returns the ids or
 * null on the first failed step (each step asserts). `tag` prefixes assertions.
 */
async function runOfferToBooking(
  ctx: Ctx,
  tag: string,
  sourceChannel: string,
): Promise<{ inquiryId: string; offerId: string; bookingId: string } | null> {
  // 1. Submit (service-role so the coordinator/talent participant fan-out lands;
  //    a client-session submit is RLS-blocked → 0 participants → flow can't auth).
  const submit = await submitInquiry(admin as never, {
    tenant_id: TENANT,
    contact_name: "QA Client One",
    contact_email: "qa-client-1@impronta.test",
    event_date: "2026-11-14",
    event_location: "Ciudad de México, CDMX, Mexico",
    message: "QA cash-cycle E2E — efectivo settle proof (auto-cleaned).",
    source_channel: sourceChannel,
    source_page: "/t/TAL-AUDIT-0512",
    client_user_id: ctx.clientUserId,
    actorUserId: ctx.clientUserId,
    talent_profile_ids: [MORENA_TALENT],
    initiator_role: "client",
    source_context: { qa_cash_cycle: true },
  });
  if (!ok(`${tag} submitInquiry`, submit.success, submit.success ? "" : JSON.stringify(submit))) return null;
  const inquiryId = submit.data!.inquiryId;
  info(`inquiryId = ${inquiryId} (channel=${sourceChannel})`);

  // Reassign coordination to the staff coordinator. On impronta the auto-resolved
  // coordinator is the priced talent's own user (F1/A3 collision) whenever the
  // talent self-coordinates; reassigning both fixes that AND gives us a session
  // whose auth.uid() the convert RPC accepts.
  const { data: inqRow } = await admin.from("inquiries").select("coordinator_id").eq("id", inquiryId).maybeSingle();
  const autoCoordinatorId = (inqRow as { coordinator_id?: string } | null)?.coordinator_id ?? null;
  info(`auto-resolved coordinator_id = ${autoCoordinatorId}${autoCoordinatorId === ctx.talentUserId ? "  ← IS the priced talent (F1/A3 collision)" : ""}`);

  const reassign = await assignCoordinator(admin as never, {
    inquiryId,
    tenantId: TENANT,
    coordinatorUserId: ctx.coordinatorUserId,
    actorUserId: ctx.coordinatorUserId, // super_admin → staff-bypass authorizes
    expectedVersion: await inqVersion(inquiryId),
  });
  if (!ok(`${tag} reassign coordination to staff coordinator`, reassign.success, reassign.success ? "" : JSON.stringify(reassign))) {
    return { inquiryId, offerId: "", bookingId: "" };
  }

  // 2. Build the offer: client $500, talent net cost $400, one `event` line.
  const co = await createOffer(admin as never, {
    inquiryId, tenantId: TENANT, actorUserId: ctx.coordinatorUserId,
    expectedVersion: await inqVersion(inquiryId), currencyCode: "USD",
  });
  if (!ok(`${tag} createOffer`, co.success, co.success ? "" : JSON.stringify(co))) return { inquiryId, offerId: "", bookingId: "" };
  const offerId = co.data!.offerId;

  const upd = await updateOfferDraft(admin as never, {
    inquiryId, tenantId: TENANT, offerId, actorUserId: ctx.coordinatorUserId,
    inquiryExpectedVersion: await inqVersion(inquiryId),
    offerExpectedVersion: await offerVersion(offerId),
    total_client_price: 500, coordinator_fee: 0, currency_code: "USD",
    notes: "CDMX shoot — talent paid in cash on the day.",
    lineItems: [{
      talent_profile_id: MORENA_TALENT, label: "Event day rate (travel incl.)",
      pricing_unit: "event", units: 1, unit_price: 500, total_price: 500, talent_cost: 400,
      notes: "Efectivo on the day; travel baked into the line total.", sort_order: 0,
    }],
  });
  if (!ok(`${tag} updateOfferDraft (client $500 / talent_cost $400)`, upd.success, upd.success ? "" : JSON.stringify(upd))) return { inquiryId, offerId, bookingId: "" };

  const sent = await sendOffer(admin as never, {
    inquiryId, tenantId: TENANT, offerId, actorUserId: ctx.coordinatorUserId,
    inquiryExpectedVersion: await inqVersion(inquiryId),
    offerExpectedVersion: await offerVersion(offerId),
  });
  if (!ok(`${tag} sendOffer`, sent.success, sent.success ? "" : JSON.stringify(sent))) return { inquiryId, offerId, bookingId: "" };

  // 3. Talent (service-role, actor=talent) + client (real session) accept.
  const tr = await talentRespondToOffer(admin as never, {
    inquiryId, tenantId: TENANT, offerId, actorUserId: ctx.talentUserId,
    expectedVersion: await inqVersion(inquiryId), decision: "accepted",
  });
  if (!ok(`${tag} talentRespondToOffer (accept)`, tr.success, tr.success ? "" : JSON.stringify(tr))) return { inquiryId, offerId, bookingId: "" };

  const cr = await clientAcceptOffer(ctx.clientSb as never, {
    inquiryId, tenantId: TENANT, offerId, actorUserId: ctx.clientUserId,
    expectedVersion: await inqVersion(inquiryId),
  });
  if (!ok(`${tag} clientAcceptOffer (accept)`, cr.success, cr.success ? "" : JSON.stringify(cr))) return { inquiryId, offerId, bookingId: "" };

  const { data: afterAccept } = await admin.from("inquiries").select("status").eq("id", inquiryId).maybeSingle();
  ok(`${tag} all approvals complete → status='approved'`, (afterAccept as { status?: string } | null)?.status === "approved", `status=${(afterAccept as { status?: string } | null)?.status}`);

  // 4. Convert — MUST run on the coordinator's real session (RPC gates auth.uid()).
  const conv = await convertToBooking(ctx.adminSb as never, {
    inquiryId, tenantId: TENANT, actorUserId: ctx.coordinatorUserId,
    expectedVersion: await inqVersion(inquiryId),
  });
  if (!ok(`${tag} convertToBooking`, conv.success, conv.success ? `booking ${conv.data!.bookingId}` : JSON.stringify(conv))) return { inquiryId, offerId, bookingId: "" };
  info(`bookingId = ${conv.data!.bookingId}`);
  return { inquiryId, offerId, bookingId: conv.data!.bookingId };
}

/** Reclassify the convert-default (card) snapshot to CASH — the off-platform
 *  branch of the persist RPC (accrual + balance bump for workspace-owned lanes;
 *  the same branch instant-book #819 pay-in-person uses at creation). */
async function reclassifyCash(bookingId: string, tag: string): Promise<Array<{
  owning_party_type: string; payment_method: string; off_platform_reason: string | null;
  gross_charged_cents: number; talent_net_cents: number; workspace_fee_cents: number; platform_fee_cents: number;
}>> {
  const { data: cardSnap } = await admin.from("booking_commission_snapshot").select("payment_method").eq("booking_id", bookingId);
  info(`convert-time snapshot payment_method = ${[...new Set(((cardSnap ?? []) as Array<{ payment_method: string }>).map((r) => r.payment_method))].join(",")} (product default)`);
  const { error: delErr } = await admin.from("booking_commission_snapshot").delete().eq("booking_id", bookingId);
  ok(`${tag} cleared convert-default (card) snapshot to reclassify`, !delErr, delErr?.message ?? "");
  const cash = await persistBookingCommissionSnapshot(admin as never, bookingId, "cash", "efectivo");
  ok(`${tag} re-persist commission snapshot as CASH`, cash.ok, cash.ok ? "" : JSON.stringify(cash));
  const { data: snapRows } = await admin
    .from("booking_commission_snapshot")
    .select("owning_party_type, payment_method, off_platform_reason, gross_charged_cents, talent_net_cents, workspace_fee_cents, platform_fee_cents")
    .eq("booking_id", bookingId);
  return (snapRows ?? []) as never;
}

async function cleanupBookingAndInquiry(bookingId: string, inquiryId: string, reverseBalanceCents = 0) {
  const del = async (label: string, p: Promise<{ error: unknown }>) => {
    const { error } = await p;
    if (error) console.log(`   ⚠️  ${label}: ${(error as { message?: string }).message}`);
  };
  if (reverseBalanceCents > 0) {
    const { data: balNow } = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle();
    const bc = ((balNow as { balances_cents?: Record<string, number> } | null)?.balances_cents ?? {}) as Record<string, number>;
    bc.USD = Number(bc.USD ?? 0) - reverseBalanceCents;
    await del("reverse off-platform balance bump", admin.from("platform_commission_balances").update({ balances_cents: bc }).eq("tenant_id", TENANT).then((r) => ({ error: r.error })));
  }
  if (bookingId) {
    for (const t of ["booking_payouts", "booking_transactions", "platform_commission_movements", "booking_commission_snapshot", "booking_talent", "booking_activity_log"]) {
      await del(t, admin.from(t).delete().eq("booking_id", bookingId).then((r) => ({ error: r.error })));
    }
    await del("agency_bookings", admin.from("agency_bookings").delete().eq("id", bookingId).then((r) => ({ error: r.error })));
  }
  if (inquiryId) {
    await del("user_notifications", admin.from("user_notifications").delete().eq("origin_inquiry_id", inquiryId).then((r) => ({ error: r.error })));
    await del("agency_client_relationships.first_inquiry_id → null", admin.from("agency_client_relationships").update({ first_inquiry_id: null }).eq("first_inquiry_id", inquiryId).then((r) => ({ error: r.error })));
    await del("inquiries (cascade children)", admin.from("inquiries").delete().eq("id", inquiryId).then((r) => ({ error: r.error })));
  }
}

async function main() {
  console.log("=== QA cash-cycle E2E (offer → booking → CASH settle) ===\n");

  const { data: balRow0 } = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle();
  const balBaseUsd = Number((balRow0 as { balances_cents?: Record<string, number> } | null)?.balances_cents?.USD ?? 0);
  info(`workspace off-platform balance at start: ${balBaseUsd} cents (USD)`);

  const { data: tp } = await admin.from("talent_profiles").select("user_id").eq("id", MORENA_TALENT).maybeSingle();
  const talentUserId = (tp as { user_id?: string } | null)?.user_id ?? null;
  if (!ok("talent has a claimed user account (can approve)", !!talentUserId, `user=${talentUserId}`)) return;

  const clientSb: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: cAuth, error: cErr } = await clientSb.auth.signInWithPassword({ email: "qa-client-1@impronta.test", password: "Impronta-QA-Client-2026!" });
  if (!ok("client sign-in (qa-client-1)", !cErr && !!cAuth?.user, cErr?.message)) return;

  const adminSb: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: aAuth, error: aErr } = await adminSb.auth.signInWithPassword({ email: "qa-admin@impronta.test", password: "Impronta-QA-Admin-2026!" });
  if (!ok("staff coordinator sign-in (qa-admin, super_admin)", !aErr && !!aAuth?.user, aErr?.message)) return;

  const ctx: Ctx = {
    clientSb, clientUserId: cAuth!.user!.id,
    adminSb, coordinatorUserId: aAuth!.user!.id,
    talentUserId: talentUserId!,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LANE A — pinned MORENA (independent). Full cash cycle → paid/confirmed.
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── LANE A: pinned talent MORENA — offer → booking → CASH → paid ──");
  let a: { inquiryId: string; offerId: string; bookingId: string } | null = null;
  let aTempPayoutAccountId = "";
  try {
    a = await runOfferToBooking(ctx, "A.", "public_talent_profile");
    if (a?.bookingId) {
      const bookingId = a.bookingId;
      const snaps = await reclassifyCash(bookingId, "A.");
      ok("A. snapshot persisted (>=1 row)", snaps.length > 0, `${snaps.length} row(s)`);

      const grossCharged = snaps.reduce((s, r) => s + Number(r.gross_charged_cents), 0);
      const talentNet = snaps.reduce((s, r) => s + Number(r.talent_net_cents), 0);
      const workspaceFee = snaps.reduce((s, r) => s + Number(r.workspace_fee_cents), 0);
      const platformFee = snaps.reduce((s, r) => s + Number(r.platform_fee_cents), 0);
      const sellerIsWorkspace = snaps.every((r) => r.owning_party_type === "workspace" || r.owning_party_type === "agency");
      info(`seller-of-record: ${sellerIsWorkspace ? "workspace" : "talent (independent)"}  owning_party=${[...new Set(snaps.map((r) => r.owning_party_type))].join(",")}`);
      info(`split (cents): talent_net=${talentNet}  workspace_fee=${workspaceFee}  platform_fee=${platformFee}  gross_charged=${grossCharged}`);
      info(`split ($):     talent_net=${(talentNet / 100).toFixed(2)}  workspace_fee=${(workspaceFee / 100).toFixed(2)}  platform_fee=${(platformFee / 100).toFixed(2)}  gross_charged=${(grossCharged / 100).toFixed(2)}`);

      ok("A. MONEY INVARIANT: talent_net + workspace_fee + platform_fee === gross_charged",
         talentNet + workspaceFee + platformFee === grossCharged,
         `${talentNet} + ${workspaceFee} + ${platformFee} = ${talentNet + workspaceFee + platformFee} vs ${grossCharged}`);
      // Independent talent sells direct: keeps the full client price minus the
      // platform's seller cut (the offer's talent_cost / agency margin do not apply).
      ok("A. independent talent nets client price − platform take (net === gross_charged − platform_fee)",
         talentNet === grossCharged - platformFee && talentNet > 0,
         `talent_net=${talentNet} gross_charged−platform_fee=${grossCharged - platformFee}`);

      ok("A. snapshot payment_method === 'cash' (every row)", snaps.length > 0 && snaps.every((r) => r.payment_method === "cash"), snaps.map((r) => r.payment_method).join(","));
      ok("A. isOffPlatformPaymentMethod('cash') === true", isOffPlatformPaymentMethod("cash") === true);
      ok("A. snapshot carries off_platform_reason (cash obligation recorded)", snaps.every((r) => (r.off_platform_reason ?? "") === "efectivo"), snaps.map((r) => r.off_platform_reason).join(","));

      // Independent talent = talent is the seller, so there is NO workspace lane;
      // the accrual/balance bump (workspace-owned only) is correctly skipped. The
      // WORKSPACE accrual path is proven in Lane B.
      const { data: mvA } = await admin.from("platform_commission_movements").select("movement_type").eq("booking_id", bookingId);
      ok("A. talent-direct: NO workspace accrual movement (owning_party='talent')", (mvA ?? []).length === 0, `${(mvA ?? []).length} movement(s)`);

      // ── Settle to paid via a manual (no-Stripe) transaction.
      const txn = await createBookingTransaction({
        bookingId, sourceTenantId: TENANT, sourceInquiryId: a.inquiryId, planTier: "agency",
        grossAmountCents: grossCharged, platformFeeCentsOverride: platformFee, currency: "USD",
        payerUserId: ctx.clientUserId, payerEmail: "qa-client-1@impronta.test", checkoutType: "full",
      });
      if (ok("A. booking transaction drafted (provider='manual')", txn.ok, txn.ok ? "" : JSON.stringify(txn)) && txn.ok) {
        const transactionId = txn.data.id;
        ok("A. transaction is manual + carries NO Stripe object (no PI/charge id)",
           txn.data.provider === "manual" && txn.data.providerReference === null,
           `provider=${txn.data.provider} provider_reference=${txn.data.providerReference}`);

        // F2 finding: payment_requested is gated on payout_receiver_id even for cash.
        const pre = await requestPayment(transactionId);
        ok("A. F2 FINDING: cash txn blocked at payment_requested with NO payout receiver", pre.ok === false, pre.ok ? "unexpectedly succeeded" : pre.error);

        // payout_accounts has a unique agency-account-per-tenant slot; clear any
        // leftover temp receiver from a prior crashed run before inserting.
        await admin.from("payout_accounts").delete().eq("tenant_id", TENANT).eq("owner_type", "agency").eq("display_name", TEMP_RECEIVER_NAME);
        const { data: pa, error: paErr } = await admin.from("payout_accounts").insert({
          tenant_id: TENANT, owner_type: "agency", owner_id: TENANT,
          display_name: TEMP_RECEIVER_NAME, provider: "manual_bank", status: "connected",
        }).select("id").single();
        aTempPayoutAccountId = (pa?.id as string) ?? "";
        ok("A. provisioned temp manual receiver (no Stripe account)", !!aTempPayoutAccountId && !paErr, paErr?.message ?? "");
        const setR = await setTransactionPayoutReceiver({ transactionId, payoutAccountId: aTempPayoutAccountId, sourceTenantId: TENANT });
        ok("A. receiver set on transaction", setR.ok, setR.ok ? "" : setR.error);

        const req = await requestPayment(transactionId);
        ok("A. requestPayment → payment_requested", req.ok, req.ok ? `status=${req.data.status}` : req.error);
        const paid = await markPaid(transactionId);
        ok("A. markPaid (cash received) → paid", paid.ok, paid.ok ? `status=${paid.data.status}` : paid.error);

        const { data: st } = await admin.from("booking_transactions").select("status, provider, provider_reference").eq("id", transactionId).maybeSingle();
        const stRow = st as { status?: string; provider?: string; provider_reference?: string | null } | null;
        ok("A. transaction status === 'paid'", stRow?.status === "paid", `status=${stRow?.status}`);
        ok("A. NO Stripe PaymentIntent/charge on the cash transaction", stRow?.provider === "manual" && !stRow?.provider_reference, `provider=${stRow?.provider} provider_reference=${stRow?.provider_reference}`);

        const { data: bk } = await admin.from("agency_bookings").select("payment_status, status, client_revenue_lifecycle").eq("id", bookingId).maybeSingle();
        const bkRow = bk as { payment_status?: string; status?: string; client_revenue_lifecycle?: string } | null;
        ok("A. booking payment_status ends 'paid' (confirmed) after cash markPaid", bkRow?.payment_status === "paid", `payment_status=${bkRow?.payment_status} status=${bkRow?.status} lifecycle=${bkRow?.client_revenue_lifecycle}`);

        const { data: payouts } = await admin.from("booking_payouts").select("status, stripe_transfer_id").eq("booking_id", bookingId);
        const legs = (payouts ?? []) as Array<{ status: string; stripe_transfer_id: string | null }>;
        ok("A. payout side made ZERO Stripe transfers (no transfer id on any leg)", !legs.some((l) => !!l.stripe_transfer_id), legs.length ? legs.map((l) => `${l.status}:${l.stripe_transfer_id ?? "null"}`).join(", ") : "no legs");

        console.log("\n   LANE A SUMMARY (talent-direct cash):");
        console.log(`     client charged $${(grossCharged / 100).toFixed(2)}  →  talent nets $${(talentNet / 100).toFixed(2)} cash (off-platform)  ·  platform take $${(platformFee / 100).toFixed(2)} owed by talent  ·  workspace margin $${(workspaceFee / 100).toFixed(2)}`);
        console.log(`     booking payment_status=paid · transaction manual, no Stripe object · zero Stripe transfers`);
      }
    }
  } finally {
    console.log("   ── lane A cleanup ──");
    if (a) await cleanupBookingAndInquiry(a.bookingId, a.inquiryId, 0);
    // Delete the temp receiver AFTER the booking transaction is gone (FK SET NULL),
    // by name so a leftover from any prior run is always swept.
    await admin.from("payout_accounts").delete().eq("tenant_id", TENANT).eq("owner_type", "agency").eq("display_name", TEMP_RECEIVER_NAME);
    if (a?.inquiryId) {
      const { data: gone } = await admin.from("inquiries").select("id").eq("id", a.inquiryId).maybeSingle();
      const { data: bkGone } = a.bookingId ? await admin.from("agency_bookings").select("id").eq("id", a.bookingId).maybeSingle() : { data: null };
      ok("A. cleanup verified (inquiry + booking removed)", !gone && !bkGone, `inquiry=${gone ? "EXISTS" : "gone"} booking=${bkGone ? "EXISTS" : "gone"}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LANE B — MORENA made WORKSPACE-owned (temp roster) → prove off-platform
  //          WORKSPACE balance accrual. (Convert only; markPaid proven in A.)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── LANE B: workspace-owned talent — CASH accrues to workspace balance ──");
  let b: { inquiryId: string; offerId: string; bookingId: string } | null = null;
  let bAccrued = 0;
  try {
    // MORENA already has an ACTIVE (non-exclusive) roster row on impronta, so a
    // NON-hub channel (agency_site) routes the talent to owning_party='workspace'
    // (verified: hub channels self-coordinate to 'talent'; agency_site → workspace).
    // No roster mutation needed — we use the real ownership as-is.
    const balB0 = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle();
    const balBBefore = Number((balB0.data as { balances_cents?: Record<string, number> } | null)?.balances_cents?.USD ?? 0);

    b = await runOfferToBooking(ctx, "B.", "agency_site");
    if (b?.bookingId) {
      const bookingId = b.bookingId;
      const snaps = await reclassifyCash(bookingId, "B.");
      const grossCharged = snaps.reduce((s, r) => s + Number(r.gross_charged_cents), 0);
      const talentNet = snaps.reduce((s, r) => s + Number(r.talent_net_cents), 0);
      const workspaceFee = snaps.reduce((s, r) => s + Number(r.workspace_fee_cents), 0);
      const platformFee = snaps.reduce((s, r) => s + Number(r.platform_fee_cents), 0);
      bAccrued = platformFee;
      const sellerIsWorkspace = snaps.every((r) => r.owning_party_type === "workspace" || r.owning_party_type === "agency");
      info(`seller-of-record: ${sellerIsWorkspace ? "workspace" : "talent"}  owning_party=${[...new Set(snaps.map((r) => r.owning_party_type))].join(",")}`);
      info(`split (cents): talent_net=${talentNet}  workspace_fee=${workspaceFee}  platform_fee=${platformFee}  gross_charged=${grossCharged}`);
      info(`split ($):     talent_net=${(talentNet / 100).toFixed(2)}  workspace_fee=${(workspaceFee / 100).toFixed(2)}  platform_fee=${(platformFee / 100).toFixed(2)}  gross_charged=${(grossCharged / 100).toFixed(2)}`);

      ok("B. workspace-owned seller-of-record", sellerIsWorkspace, [...new Set(snaps.map((r) => r.owning_party_type))].join(","));
      ok("B. MONEY INVARIANT: talent_net + workspace_fee + platform_fee === gross_charged",
         talentNet + workspaceFee + platformFee === grossCharged,
         `${talentNet} + ${workspaceFee} + ${platformFee} = ${talentNet + workspaceFee + platformFee} vs ${grossCharged}`);
      ok("B. talent PROTECTED: talent_net === offered $400 (40000c)", talentNet === 40000, `talent_net=${talentNet}`);
      ok("B. workspace keeps a margin (workspace_fee > 0)", workspaceFee > 0, `workspace_fee=${workspaceFee}`);
      ok("B. snapshot payment_method === 'cash'", snaps.every((r) => r.payment_method === "cash"), snaps.map((r) => r.payment_method).join(","));

      // The headline off-platform behavior: platform take accrues to the workspace.
      const { data: mv } = await admin.from("platform_commission_movements").select("movement_type, amount_cents, currency_code").eq("booking_id", bookingId);
      const movements = (mv ?? []) as Array<{ movement_type: string; amount_cents: number; currency_code: string }>;
      const accrualSum = movements.filter((m) => m.movement_type === "accrual").reduce((s, m) => s + Number(m.amount_cents), 0);
      ok("B. off-platform ACCRUAL movement recorded (= platform_fee)", accrualSum === platformFee && platformFee > 0, `accrual=${accrualSum} platform_fee=${platformFee}`);

      const balB1 = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle();
      const balBAfter = Number((balB1.data as { balances_cents?: Record<string, number> } | null)?.balances_cents?.USD ?? 0);
      ok("B. workspace off-platform balance-owed += platform_fee", balBAfter - balBBefore === platformFee, `before=${balBBefore} after=${balBAfter} delta=${balBAfter - balBBefore} expected=${platformFee}`);

      console.log("\n   LANE B SUMMARY (workspace-seller cash):");
      console.log(`     client charged $${(grossCharged / 100).toFixed(2)}  →  talent PROTECTED $${(talentNet / 100).toFixed(2)}  ·  workspace margin $${(workspaceFee / 100).toFixed(2)}  ·  platform take $${(platformFee / 100).toFixed(2)} ACCRUED to workspace off-platform balance`);
    }
  } finally {
    console.log("   ── lane B cleanup ──");
    // Reverse ONLY the accrual this lane added; the pre-existing MORENA roster row
    // is real and left untouched.
    if (b) await cleanupBookingAndInquiry(b.bookingId, b.inquiryId, bAccrued);
    // Verify the off-platform balance is restored to the pre-run baseline.
    const { data: balEnd } = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle();
    const balEndUsd = Number((balEnd as { balances_cents?: Record<string, number> } | null)?.balances_cents?.USD ?? 0);
    ok("B. cleanup verified (off-platform balance restored to baseline)", balEndUsd === balBaseUsd, `balance ${balBaseUsd}→${balEndUsd}`);
  }

  console.log(`\n=== ${FAILED === 0 ? "PASS — cash cycle proven ✅ (both talent-direct and workspace-seller)" : `FAIL — ${FAILED} assertion(s) ❌`} ===`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
