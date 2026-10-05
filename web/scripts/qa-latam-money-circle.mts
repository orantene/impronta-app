/**
 * GRAND LATAM MONEY-CIRCLE QA (test mode, real Stripe objects)
 *
 * The owner's vision, asserted end to end:
 *   • a MEXICAN talent (More) and an ARGENTINE talent (julieta) each get a
 *     receive-only connected account IN THEIR COUNTRY and receive their real
 *     talent_net as a Stripe transfer;
 *   • the AGENCY (Alejandra's workspace = Impronta) has its own connected
 *     account and receives its workspace commission as a transfer;
 *   • the PLATFORM keeps its per-transaction fee on the platform balance and
 *     has membership prices configured (talent Pro + agency plan);
 *   • a booking paid by card fans out ALL legs with exact snapshot amounts.
 *
 * Everything created is deleted afterwards; every stamped DB column restored.
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { submitInquiry } from "../src/lib/inquiry/inquiry-engine-submit";
import { assignCoordinator } from "../src/lib/inquiry/inquiry-engine-coordinator";
import { createOffer, updateOfferDraft, sendOffer } from "../src/lib/inquiry/inquiry-engine-offers";
import { clientAcceptOffer, talentRespondToOffer, submitApproval } from "../src/lib/inquiry/inquiry-engine-approvals";
import { convertToBooking } from "../src/lib/inquiry/inquiry-engine-booking";
import { createBookingTransaction, requestPayment, markPaid, loadActiveBookingTransaction } from "../src/lib/bookings/transactions";
import { executeBookingTransfers } from "../src/lib/payments/transfers";
import { persistBookingCommissionSnapshot } from "../src/lib/billing/commission-engine";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/"/g, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/"/g, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!.replace(/"/g, "");
const SK = (process.env.STRIPE_SECRET_KEY ?? "").replace(/"/g, "");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stripe = new Stripe(SK);
const TENANT = "00000000-0000-0000-0000-000000000001";
const MORE = "1d6bcec0-874d-427d-90ce-9f9c8f0e8929";      // Mexican talent
const JULIETA = "af553e78-3830-42be-ad08-7e923edc7e07";   // Argentine talent

let FAILED = 0;
const ok = (n: string, c: unknown, e = "") => { console.log(`${c ? "✅" : "❌"} ${n}${e ? " — " + e : ""}`); if (!c) { FAILED++; process.exitCode = 1; } };
const ver = async (id: string) => ((await admin.from("inquiries").select("version").eq("id", id).single()).data as { version: number }).version;
const over = async (id: string) => ((await admin.from("inquiry_offers").select("version").eq("id", id).single()).data as { version: number }).version;

const STRIPE_COLS = "stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted";

async function createRecipientAccount(country: "MX" | "AR" | "US", label: string): Promise<string> {
  // Mirrors stripe-connect-talent.ts: individual, transfers-only. Cross-border
  // recipients (MX/AR) additionally need the RECIPIENT service agreement.
  const banks: Record<string, Record<string, string>> = {
    MX: { object: "bank_account", country: "MX", currency: "mxn", account_number: "000000001234567897" },
    AR: { object: "bank_account", country: "AR", currency: "ars", account_number: "0110000600000000000000" },
    US: { object: "bank_account", country: "US", currency: "usd", routing_number: "110000000", account_number: "000123456789" },
  };
  const base: Stripe.AccountCreateParams = {
    type: "custom", country, email: `qa-${label}@impronta.test`,
    business_type: "individual",
    capabilities: { transfers: { requested: true } },
    business_profile: { mcc: "7333", url: "https://impronta.example/qa", product_description: "QA talent" },
    individual: {
      first_name: "QA", last_name: label, email: `qa-${label}@impronta.test`,
      phone: "+15555550123", dob: { day: 1, month: 1, year: 1901 },
      address: country === "US"
        ? { line1: "123 Test St", city: "San Francisco", state: "CA", postal_code: "94111", country: "US" }
        : country === "MX"
        ? { line1: "Calle Prueba 1", city: "Tulum", state: "ROO", postal_code: "77760", country: "MX" }
        : { line1: "Calle Prueba 1", city: "Buenos Aires", postal_code: "C1000", country: "AR" },
      ...(country === "US" ? { ssn_last_4: "0000" } : {}),
      ...(country === "AR" || country === "MX" ? { id_number: "000000000" } : {}),
    },
    external_account: banks[country] as never,
    tos_acceptance: country === "US"
      ? { date: 1_750_000_000, ip: "127.0.0.1" }
      : { date: 1_750_000_000, ip: "127.0.0.1", service_agreement: "recipient" },
  };
  const acct = await stripe.accounts.create(base);
  // poll until payouts_enabled (test-mode verification is quick)
  for (let i = 0; i < 20; i++) {
    const a = await stripe.accounts.retrieve(acct.id);
    if (a.payouts_enabled) return acct.id;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const a = await stripe.accounts.retrieve(acct.id);
  throw new Error(`${label} (${country}) never became payouts_enabled: reqs=${JSON.stringify(a.requirements?.currently_due).slice(0, 300)}`);
}

async function stamp(table: "talent_profiles" | "agencies", id: string, acctId: string) {
  await admin.from(table).update({
    stripe_account_id: acctId, stripe_account_status: "enabled",
    stripe_charges_enabled: false, stripe_payouts_enabled: true, stripe_details_submitted: true,
    stripe_account_synced_at: new Date().toISOString(),
  }).eq("id", id);
}

async function main() {
  console.log("=== LATAM MONEY CIRCLE (MX + AR talents, agency commission, platform fee) ===\n");
  ok("0. key is TEST mode", SK.startsWith("sk_test"));
  if (!SK.startsWith("sk_test")) return;

  // snapshots for restore
  const prior: Record<string, unknown> = {};
  for (const [t, id] of [["talent_profiles", MORE], ["talent_profiles", JULIETA], ["agencies", TENANT]] as const) {
    prior[`${t}:${id}`] = (await admin.from(t).select(STRIPE_COLS).eq("id", id).maybeSingle()).data;
  }
  const balancesBefore = JSON.stringify(((await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle()).data as { balances_cents?: unknown } | null)?.balances_cents ?? {});

  let mxAcct = "", arAcct = "", agAcct = "", INQ = "", BK = "";
  try {
    // ── 1. Recipient accounts in MEXICO and ARGENTINA + the agency's US account ──
    mxAcct = await createRecipientAccount("MX", "MoreMX");
    ok("1. MEXICO recipient account fully enabled (transfers+payouts)", true, mxAcct);
    arAcct = await createRecipientAccount("AR", "JulietaAR");
    ok("1. ARGENTINA recipient account fully enabled (transfers+payouts)", true, arAcct);
    agAcct = await createRecipientAccount("US", "AgencyAlejandra");
    ok("1. AGENCY (Alejandra) account fully enabled", true, agAcct);
    await stamp("talent_profiles", MORE, mxAcct);
    await stamp("talent_profiles", JULIETA, arAcct);
    await stamp("agencies", TENANT, agAcct);

    // ── 2. fund the platform test balance with a real card charge ──
    const pi = await stripe.paymentIntents.create({ amount: 300_000, currency: "usd", payment_method: "pm_card_bypassPending", confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: "never" }, description: "LatAm QA funding" });
    ok("2. platform funded via card charge", pi.status === "succeeded", pi.id);

    // ── 3. booking: 2 talents + coordinator fee (workspace-seller lane) ──
    const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: c } = await clientSb.auth.signInWithPassword({ email: "qa-client-1@impronta.test", password: "Impronta-QA-Client-2026!" });
    const clientUser = c!.user!.id;
    const adminSb = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: a } = await adminSb.auth.signInWithPassword({ email: "qa-admin@impronta.test", password: "Impronta-QA-Admin-2026!" });
    const staffUser = a!.user!.id;

    const sub = await submitInquiry(admin as never, { tenant_id: TENANT, contact_name: "QA Client One", contact_email: "qa-client-1@impronta.test", event_date: "2026-10-03", event_location: "Buenos Aires", quantity: 2, message: "LatAm circle QA: MX + AR talents", source_channel: "directory_client", client_user_id: clientUser, talent_profile_ids: [MORE, JULIETA], actorUserId: clientUser, initiator_role: "client" } as never);
    INQ = (sub as { data: { inquiryId: string } }).data.inquiryId;
    await assignCoordinator(admin as never, { inquiryId: INQ, tenantId: TENANT, coordinatorUserId: staffUser, actorUserId: staffUser, expectedVersion: await ver(INQ) });
    const co = await createOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, actorUserId: staffUser, expectedVersion: await ver(INQ), currencyCode: "USD" });
    const offerId = (co as { data: { offerId: string } }).data.offerId;
    await updateOfferDraft(admin as never, {
      inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: staffUser,
      inquiryExpectedVersion: await ver(INQ), offerExpectedVersion: await over(offerId),
      total_client_price: 900, coordinator_fee: 100, currency_code: "USD", notes: "LatAm QA",
      lineItems: [
        { talent_profile_id: MORE, label: "More (MX)", pricing_unit: "event", units: 1, unit_price: 400, total_price: 400, talent_cost: 320, notes: "", sort_order: 0 },
        { talent_profile_id: JULIETA, label: "julieta (AR)", pricing_unit: "event", units: 1, unit_price: 400, total_price: 400, talent_cost: 320, notes: "", sort_order: 1 },
      ],
    });
    await sendOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: staffUser, inquiryExpectedVersion: await ver(INQ), offerExpectedVersion: await over(offerId) });
    // approvals: both talents (via user where present, else coordinator on-behalf) + client
    const { data: pend } = await admin.from("inquiry_approvals").select("participant_id").eq("inquiry_id", INQ).eq("status", "pending");
    for (const row of pend ?? []) {
      const { data: part } = await admin.from("inquiry_participants").select("user_id").eq("id", (row as { participant_id: string }).participant_id).single();
      const uid = (part as { user_id: string | null }).user_id;
      if (uid) await talentRespondToOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: uid, expectedVersion: await ver(INQ), decision: "accepted" });
      else await submitApproval(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, participantId: (row as { participant_id: string }).participant_id, actorUserId: staffUser, expectedVersion: await ver(INQ), decision: "accepted" });
    }
    await clientAcceptOffer(admin as never, { inquiryId: INQ, tenantId: TENANT, offerId, actorUserId: clientUser, expectedVersion: await ver(INQ) });
    const conv = await convertToBooking(adminSb as never, { inquiryId: INQ, tenantId: TENANT, actorUserId: staffUser, expectedVersion: await ver(INQ) });
    BK = (conv as { data?: { bookingId?: string } }).data?.bookingId ?? "";
    ok("3. booked (2 talents + coordinator fee)", !!BK, BK);

    // Newer main defers snapshot persistence — persist explicitly (card lane),
    // exactly like the settle actions do before charging.
    const persisted = await persistBookingCommissionSnapshot(admin as never, BK, "card" as never, null) as { ok?: boolean; snapshots?: Array<Record<string, unknown>> };
    console.log("   snapshot persist ok:", persisted.ok, "rows:", persisted.snapshots?.length);
    const { data: snapsQ, error: snapsErr } = await admin.from("booking_commission_snapshot").select("*").eq("booking_id", BK);
    if (snapsErr) console.log("   snapshot select ERROR:", JSON.stringify(snapsErr));
    const snaps = (snapsQ && snapsQ.length ? snapsQ : (persisted.snapshots ?? [])) as Array<Record<string, unknown>>;
    if (snaps[0]) console.log("   snapshot keys:", Object.keys(snaps[0]).filter(k => /cents|talent_profile/.test(k)).join(","));
    const num = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) { if (r[k] != null) return Number(r[k]); } return 0; };
    const sumOf = (...keys: string[]) => snaps.reduce((acc, r) => acc + num(r, ...keys), 0);
    const grossSum = sumOf("gross_charged_cents", "gross_cents");
    const netSum = sumOf("talent_net_cents"), wsSum = sumOf("workspace_fee_cents"), pfSum = sumOf("platform_fee_cents");
    ok("   invariant", netSum + wsSum + pfSum === grossSum && grossSum > 0, `${netSum}+${wsSum}+${pfSum}=${grossSum}`);

    // ── 4. settle full amount (card-lane snapshot default) + fan out transfers ──
    const d = await createBookingTransaction({ bookingId: BK, sourceTenantId: TENANT, sourceInquiryId: INQ, planTier: "agency", grossAmountCents: grossSum, platformFeeCentsOverride: pfSum, currency: "USD", payerUserId: clientUser, checkoutType: "full" });
    ok("4. txn drafted", d.ok, d.ok ? "" : (d as { error: string }).error);
    const txn = await loadActiveBookingTransaction(BK, admin as never);
    if (txn) { const r = await requestPayment(txn.id); if (r.ok) await markPaid(txn.id); }
    const st = (await admin.from("agency_bookings").select("payment_status").eq("id", BK).single()).data as { payment_status: string };
    ok("   booking paid", st.payment_status === "paid", st.payment_status);

    const legs = await executeBookingTransfers(txn!.id);
    console.log("   fan-out:", JSON.stringify(legs).slice(0, 400));

    // ── 5. Stripe-side truth: each leg landed on the right account with the right amount ──
    const { data: payouts } = await admin.from("booking_payouts").select("party, talent_profile_id, amount_cents, status, stripe_transfer_id").eq("booking_id", BK);
    const legFor = (pred: (r: Record<string, unknown>) => boolean) => (payouts ?? []).find((r) => pred(r as Record<string, unknown>)) as { amount_cents: number; status: string; stripe_transfer_id: string | null } | undefined;
    const mxLeg = legFor((r) => r.party === "talent" && r.talent_profile_id === MORE);
    const arLeg = legFor((r) => r.party === "talent" && r.talent_profile_id === JULIETA);
    const wsLegs = (payouts ?? []).filter((r) => (r as Record<string, unknown>).party === "workspace") as Array<{ amount_cents: number; status: string; stripe_transfer_id: string | null }>;
    const wsLeg = wsLegs[0];
    const wsTotal = wsLegs.reduce((s2, l) => s2 + Number(l.amount_cents), 0);
    ok(`5. AGENCY (Alejandra) received ALL workspace commission legs`, wsLegs.length > 0 && wsLegs.every((l) => l.status === "transferred"), `${wsLegs.length} legs, total $${wsTotal / 100}`);
    for (const [name, leg, acct] of [["MX talent (More)", mxLeg, mxAcct], ["AR talent (julieta)", arLeg, arAcct], ["AGENCY (Alejandra) leg1", wsLeg, agAcct]] as const) {
      ok(`5. ${name} leg transferred`, leg?.status === "transferred" && !!leg?.stripe_transfer_id, `${leg?.status} $${(leg?.amount_cents ?? 0) / 100}`);
      if (leg?.stripe_transfer_id) {
        const tr = await stripe.transfers.retrieve(leg.stripe_transfer_id);
        ok(`   → Stripe destination + amount exact`, tr.destination === acct && tr.amount === leg.amount_cents, `${tr.destination} $${tr.amount / 100}`);
      }
    }
    const platformKeeps = grossSum - (mxLeg?.amount_cents ?? 0) - (arLeg?.amount_cents ?? 0) - wsTotal;
    ok("5. PLATFORM keeps exactly its fee", platformKeeps === pfSum, `$${platformKeeps / 100} == platform_fee $${pfSum / 100}`);

    // ── 6. membership revenue configured (platform's second income) ──
    for (const env of ["STRIPE_PRICE_TALENT_PRO_MONTHLY", "STRIPE_PRICE_AGENCY_MONTHLY"]) {
      const id = (process.env[env] ?? "").replace(/"/g, "");
      if (!id) { ok(`6. ${env} configured`, false, "missing env"); continue; }
      try {
        const price = await stripe.prices.retrieve(id);
        ok(`6. ${env} live on Stripe`, !!price.id && price.active !== false, `$${(price.unit_amount ?? 0) / 100}/${price.recurring?.interval}`);
      } catch (e) { ok(`6. ${env} live on Stripe`, false, (e as Error).message.slice(0, 80)); }
    }
  } finally {
    console.log("\n── cleanup ──");
    for (const [t, id] of [["talent_profiles", MORE], ["talent_profiles", JULIETA], ["agencies", TENANT]] as const) {
      const p = prior[`${t}:${id}`] as Record<string, unknown> | null;
      if (p) await admin.from(t).update(p).eq("id", id);
    }
    if (BK) {
      const { data: mv } = await admin.from("platform_commission_movements").select("amount_cents, currency_code, movement_type").eq("booking_id", BK);
      for (const m of mv ?? []) {
        if ((m as { movement_type: string }).movement_type !== "accrual") continue;
        const { data: balRow } = await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).single();
        const bals = ((balRow as { balances_cents: Record<string, number> }).balances_cents) ?? {};
        const cur = (m as { currency_code: string }).currency_code;
        bals[cur] = Number(bals[cur] ?? 0) - Number((m as { amount_cents: number }).amount_cents);
        await admin.from("platform_commission_balances").update({ balances_cents: bals }).eq("tenant_id", TENANT);
      }
      for (const t of ["booking_payouts", "booking_transactions", "platform_commission_movements", "booking_commission_snapshot", "booking_talent", "booking_activity_log"]) await admin.from(t).delete().eq("booking_id", BK);
      await admin.from("agency_bookings").delete().eq("id", BK);
    }
    if (INQ) {
      await admin.from("user_notifications").delete().eq("origin_inquiry_id", INQ);
      await admin.from("agency_client_relationships").update({ first_inquiry_id: null }).eq("first_inquiry_id", INQ);
      for (const t of ["inquiry_approvals", "inquiry_messages", "inquiry_offer_line_items", "inquiry_offers", "inquiry_participants", "inquiry_events"]) await admin.from(t).delete().eq("inquiry_id", INQ);
      await admin.from("inquiries").delete().eq("id", INQ);
    }
    for (const acct of [mxAcct, arAcct, agAcct]) { if (acct) { try { await stripe.accounts.del(acct); console.log("   deleted", acct); } catch (e) { console.log("   del fail", acct, (e as Error).message.slice(0, 60)); } } }
    const balancesAfter = JSON.stringify(((await admin.from("platform_commission_balances").select("balances_cents").eq("tenant_id", TENANT).maybeSingle()).data as { balances_cents?: unknown } | null)?.balances_cents ?? {});
    ok("7. platform balance restored", balancesAfter === balancesBefore, `${balancesBefore} -> ${balancesAfter}`);
  }
  console.log(`\n=== ${FAILED === 0 ? "PASS — the LatAm money circle is REAL: MX + AR talents paid, agency commissioned, platform fee kept ✅" : `FAIL — ${FAILED} assertion(s) ❌`} ===`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
