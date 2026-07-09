/**
 * QA — stock release on refund (Lane G1), end to end on the real rail.
 *
 * Books a synthetic PRODUCT on the payout-account talent (More) so the engine
 * sets a real payout receiver and the transaction legally reaches 'paid'
 * (payment_requested → paid via the status-transition trigger). Then:
 *   1. markRefunded on the paid product txn → stock RETURNS (unshipped).
 *   2. The release is single-shot (flag cleared) — a repeat markRefunded on the
 *      same inquiry can't double-restock (already-refunded guard aside).
 *   3. A SHIPPED product's refund does NOT auto-restock (manual decision).
 * Cleans up every synthetic row.
 *
 * Run: set -a; source .env.local; source .env.vercel.local; set +a; \
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-refund-stock.mts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInstantBooking } from "../src/lib/inquiry/instant-book-engine";
import { markRefunded } from "../src/lib/bookings/transactions";
import { upsertBookingFulfillment } from "../src/lib/bookings/fulfillment";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT = "00000000-0000-0000-0000-000000000001";
const MORE = "1d6bcec0-874d-427d-90ce-9f9c8f0e8929"; // TAL-00045, has payout account

const OFF_PROD = "0f0e000c-0000-4000-8000-000000000001"; // synthetic product, stock 6

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as SupabaseClient;

function ok(name: string, cond: unknown, extra = "") {
  const pass = Boolean(cond);
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!pass) process.exitCode = 1;
  return pass;
}

async function stockOf(): Promise<number | null> {
  const { data } = await admin.from("talent_offerings").select("inventory_qty").eq("id", OFF_PROD).maybeSingle();
  return (data as { inventory_qty: number | null } | null)?.inventory_qty ?? null;
}

async function payTxn(bookingId: string): Promise<string | null> {
  // The engine already set payout_receiver_id + payment_requested (More has a
  // payout account). payment_requested → paid is a legal trigger transition.
  const { data: txns } = await admin
    .from("booking_transactions")
    .select("id, status")
    .eq("booking_id", bookingId);
  const t = (txns ?? [])[0] as { id: string; status: string } | undefined;
  if (!t) return null;
  const { error } = await admin.from("booking_transactions").update({ status: "paid" }).eq("id", t.id);
  if (error) {
    console.log("   [payTxn]", t.status, error.message);
    return null;
  }
  return t.id;
}

async function cleanup(inquiryIds: string[]) {
  const ids = inquiryIds.filter(Boolean);
  if (ids.length) {
    const { data: bks } = await admin.from("agency_bookings").select("id").in("source_inquiry_id", ids);
    const bkIds = (bks ?? []).map((b) => (b as { id: string }).id);
    if (bkIds.length) await admin.from("agency_bookings").delete().in("id", bkIds);
    await admin.from("inquiries").delete().in("id", ids);
  }
  await admin.from("talent_offerings").delete().eq("id", OFF_PROD);
}

async function main() {
  await admin.from("talent_offerings").delete().eq("id", OFF_PROD);
  await admin.from("talent_offerings").insert({
    id: OFF_PROD, talent_profile_id: MORE, tenant_id: TENANT, kind: "product",
    title: "QA refund product", description: "synthetic",
    price_type: "flat_package", price_display: "exact", amount_cents: 1200, currency: "EUR",
    booking_mode: "instant", reserve_mode: "full", deposit_pct: null,
    allow_pay_in_person: false, cancellation_hours: null, free_reserve_expires_days: null,
    duration_minutes: null, category: "QA", inventory_qty: 6,
    status: "published", visibility: "public", moderation_state: "approved",
    is_featured: false, sort_order: 99, attributes: {},
    title_i18n: { en: "QA refund product" }, description_i18n: null,
  } as never);

  const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await clientSb.auth.signInWithPassword({
    email: "qa-client-1@impronta.test",
    password: "Impronta-QA-Client-2026!",
  });
  if (!ok("client sign-in", !authErr && !!auth?.user, authErr?.message)) return;
  const user = auth!.user!;
  const inquiriesToClean: string[] = [];

  const book = () =>
    createInstantBooking(clientSb as never, {
      tenantId: TENANT,
      talentProfileId: MORE,
      clientUserId: user.id,
      actorUserId: user.id,
      contactName: "QA Client One",
      contactEmail: "qa-client-1@impronta.test",
      sourcePage: "/t/TAL-00045",
      currencyCode: "EUR",
      offeringId: OFF_PROD,
    });

  try {
    ok("stock starts at 6", (await stockOf()) === 6);

    // ── 1. refund an UNSHIPPED product → stock returns ───────────────────────
    const r1 = await book();
    if (!ok("1. product booking A created", (r1 as { ok: boolean }).ok, JSON.stringify(r1))) return;
    const rr1 = r1 as { ok: true; inquiryId: string; bookingId: string };
    inquiriesToClean.push(rr1.inquiryId);
    ok("   stock 6 → 5", (await stockOf()) === 5);
    const txn1 = await payTxn(rr1.bookingId);
    if (!ok("   txn reached paid (real receiver)", !!txn1)) return;
    const ref1 = await markRefunded(txn1!, { refundNote: "QA G1 unshipped refund" });
    ok("   markRefunded ok", ref1.ok, ref1.ok ? "" : ref1.error);
    ok("   stock RETURNED on refund → 6", (await stockOf()) === 6);

    // ── 2. refund a SHIPPED product → NO auto-restock ────────────────────────
    const r2 = await book();
    if (!ok("2. product booking B created", (r2 as { ok: boolean }).ok)) return;
    const rr2 = r2 as { ok: true; inquiryId: string; bookingId: string };
    inquiriesToClean.push(rr2.inquiryId);
    ok("   stock 6 → 5", (await stockOf()) === 5);
    const up = await upsertBookingFulfillment(admin, rr2.bookingId, TENANT, { status: "shipped", trackingNumber: "QA-G1" });
    ok("   marked shipped", up.ok && !!up.shippedAt);
    const txn2 = await payTxn(rr2.bookingId);
    if (!ok("   txn reached paid", !!txn2)) return;
    const ref2 = await markRefunded(txn2!, { refundNote: "QA G1 shipped refund" });
    ok("   markRefunded ok", ref2.ok, ref2.ok ? "" : ref2.error);
    ok("   stock NOT auto-restocked (shipped) → stays 5", (await stockOf()) === 5, `stock=${await stockOf()}`);
  } finally {
    await cleanup(inquiriesToClean);
    console.log("\nrefund-stock QA complete (synthetic rows cleaned).");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
