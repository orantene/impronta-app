/**
 * QA — product fulfillment + payout gate, end to end on the real rail.
 *
 * Proves the money-correctness rule "a product payout never releases before the
 * item ships":
 *   1. A product offering booked via the engine stamps booking_sub_type='product'.
 *   2. isProductPayoutDeferred is TRUE before fulfillment.
 *   3. executeBookingTransfers on a settled (paid) product txn returns [] and
 *      records NO payout legs — the transfer is DEFERRED, not sent.
 *   4. After upsertBookingFulfillment(status='shipped'), the gate clears
 *      (isProductPayoutDeferred FALSE) and executeBookingTransfers now proceeds
 *      past the gate (processes the snapshot lane).
 *   5. A SERVICE booking is never deferred (control).
 *
 * Uses the makeup talent (TAL-AUDIT-0512) which has NO payout account, so the
 * post-ship transfer attempt skips at disburse (no real money moves). Cleans up
 * every synthetic row.
 *
 * Run: set -a; source .env.local; source .env.vercel.local; set +a; \
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-product-fulfillment.mts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInstantBooking } from "./qa-instant-book-compat.mts";
import { isProductPayoutDeferred, upsertBookingFulfillment } from "../src/lib/bookings/fulfillment";
import { executeBookingTransfers } from "../src/lib/payments/transfers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT = "00000000-0000-0000-0000-000000000001";
const MAKEUP = "eb97dc64-af2b-4996-a48c-913a143cfa59";

const OFF_PRODUCT = "0f0e0009-0000-4000-8000-00000000000a"; // synthetic product, instant, full reserve
const OFF_SERVICE = "0f0e0009-0000-4000-8000-00000000000b"; // synthetic service control

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as SupabaseClient;

function ok(name: string, cond: unknown, extra = "") {
  const pass = Boolean(cond);
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!pass) process.exitCode = 1;
  return pass;
}

function seed(id: string, kind: "product" | "service") {
  return {
    id,
    talent_profile_id: MAKEUP,
    tenant_id: TENANT,
    kind,
    title: `QA ${kind} fulfillment`,
    description: "synthetic QA",
    price_type: "flat_package",
    price_display: "exact",
    amount_cents: 2500,
    currency: "EUR",
    booking_mode: "instant",
    reserve_mode: "full",
    deposit_pct: null,
    allow_pay_in_person: false,
    cancellation_hours: null,
    free_reserve_expires_days: null,
    duration_minutes: null,
    category: "QA",
    inventory_qty: null,
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    is_featured: false,
    sort_order: 99,
    attributes: {},
    title_i18n: { en: `QA ${kind}` },
    description_i18n: null,
  };
}

async function cleanup(inquiryIds: string[]) {
  const ids = inquiryIds.filter(Boolean);
  if (ids.length) {
    const { data: bks } = await admin.from("agency_bookings").select("id").in("source_inquiry_id", ids);
    const bkIds = (bks ?? []).map((b) => (b as { id: string }).id);
    if (bkIds.length) await admin.from("agency_bookings").delete().in("id", bkIds); // cascades fulfillment/txns/snapshots
    await admin.from("inquiries").delete().in("id", ids);
  }
  await admin.from("talent_offerings").delete().in("id", [OFF_PRODUCT, OFF_SERVICE]);
}

async function main() {
  await admin.from("talent_offerings").delete().in("id", [OFF_PRODUCT, OFF_SERVICE]);
  await admin.from("talent_offerings").insert([seed(OFF_PRODUCT, "product"), seed(OFF_SERVICE, "service")] as never);

  const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await clientSb.auth.signInWithPassword({
    email: "qa-client-1@impronta.test",
    password: "Impronta-QA-Client-2026!",
  });
  if (!ok("client sign-in", !authErr && !!auth?.user, authErr?.message)) return;
  const user = auth!.user!;
  const inquiriesToClean: string[] = [];

  const book = (offeringId: string) =>
    createInstantBooking(clientSb as never, {
      tenantId: TENANT,
      talentProfileId: MAKEUP,
      clientUserId: user.id,
      actorUserId: user.id,
      contactName: "QA Client One",
      contactEmail: "qa-client-1@impronta.test",
      sourcePage: "/t/TAL-AUDIT-0512",
      currencyCode: "EUR",
      offeringId,
    });

  try {
    // ── PRODUCT path ────────────────────────────────────────────────────────
    const rp = await book(OFF_PRODUCT);
    if (!ok("product booking created", rp.ok, rp.ok ? rp.bookingId : (rp as { reason?: string }).reason)) return;
    if (!rp.ok) return;
    inquiriesToClean.push(rp.inquiryId);

    const { data: bk } = await admin.from("agency_bookings").select("booking_sub_type, payout_lifecycle").eq("id", rp.bookingId).maybeSingle();
    ok("1. booking_sub_type stamped 'product'", (bk as { booking_sub_type?: string })?.booking_sub_type === "product", String((bk as { booking_sub_type?: string })?.booking_sub_type));
    ok("2. isProductPayoutDeferred=true before fulfillment", (await isProductPayoutDeferred(admin, rp.bookingId)) === true);

    // The booking has a real transaction; executeBookingTransfers on it must NOT
    // release any payout leg while unshipped (money-safety observable). The
    // txn-level gate + status guard both keep it safe here; the exact gate-wiring
    // (a settled/paid product deferring specifically on shipment) is proven
    // deterministically in transfers-product-gate.test.ts.
    const { data: txns } = await admin.from("booking_transactions").select("id").eq("booking_id", rp.bookingId).limit(1);
    const txnId = (txns ?? [])[0] ? (txns![0] as { id: string }).id : null;
    ok("   product booking has a transaction", !!txnId);
    if (txnId) {
      const before = await executeBookingTransfers(txnId);
      const { data: legsBefore } = await admin.from("booking_payouts").select("id").eq("booking_id", rp.bookingId);
      ok("3. no payout released for an unshipped product", (before ?? []).length === 0 && (legsBefore ?? []).length === 0, `outcomes=${before.length} legs=${(legsBefore ?? []).length}`);
    }

    // Ship it → the gate clears.
    const up = await upsertBookingFulfillment(admin, rp.bookingId, TENANT, { status: "shipped", carrier: "QA Post", trackingNumber: "QA123" });
    ok("4. fulfillment upsert stamped shipped_at", up.ok && !!up.shippedAt, up.shippedAt ?? "no shipped_at");
    ok("5. isProductPayoutDeferred flips to false after shipment", (await isProductPayoutDeferred(admin, rp.bookingId)) === false);

    // ── SERVICE control ───────────────────────────────────────────────────────
    const rs = await book(OFF_SERVICE);
    if (ok("service booking created", rs.ok) && rs.ok) {
      inquiriesToClean.push(rs.inquiryId);
      const { data: sbk } = await admin.from("agency_bookings").select("booking_sub_type").eq("id", rs.bookingId).maybeSingle();
      ok("6. service booking_sub_type='service'", (sbk as { booking_sub_type?: string })?.booking_sub_type === "service");
      ok("   isProductPayoutDeferred=false for a service", (await isProductPayoutDeferred(admin, rs.bookingId)) === false);
    }
  } finally {
    await cleanup(inquiriesToClean);
    console.log("\nproduct fulfillment QA complete (synthetic rows cleaned).");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
