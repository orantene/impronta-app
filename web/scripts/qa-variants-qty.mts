/**
 * QA — variants & add-ons (D4) + quantity (D5), end to end on the real rail.
 *
 * Seeds a per-person service with 2 options + 1 extra, and a stocked product,
 * then proves:
 *   1. Booking with variant+extra+qty prices the offer lines correctly
 *      (main line units=qty at the VARIANT price; the extra is its own line;
 *      total = variant×qty + extra) and the commission snapshot's gross
 *      EXCEEDS the raw order total (surcharge invariant).
 *   2. A variantId belonging to another offering is REFUSED.
 *   3. A product booked with qty=2 reserves 2 units; releaseReservedOfferingStock
 *      returns them; a SECOND release is a no-op (flag cleared — no double restock).
 *   4. source_context carries the full selection (variant, add_ons, quantity).
 * Cleans up every synthetic row.
 *
 * Run: set -a; source .env.local; source .env.vercel.local; set +a; \
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-variants-qty.mts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInstantBooking } from "./qa-instant-book-compat.mts";
import { releaseReservedOfferingStock } from "../src/lib/talent/offering-stock";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT = "00000000-0000-0000-0000-000000000001";
const MAKEUP = "eb97dc64-af2b-4996-a48c-913a143cfa59";

const OFF_SVC = "0f0e000b-0000-4000-8000-000000000001"; // per_person service, base 20 EUR
const OFF_PROD = "0f0e000b-0000-4000-8000-000000000002"; // product, stock 5, 15 EUR
const VAR_STD = "0f0e000b-0000-4000-8000-000000000011"; // null price (base)
const VAR_PREM = "0f0e000b-0000-4000-8000-000000000012"; // 50 EUR
const ADDON_TRAVEL = "0f0e000b-0000-4000-8000-000000000021"; // +15 EUR

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as SupabaseClient;

function ok(name: string, cond: unknown, extra = "") {
  const pass = Boolean(cond);
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!pass) process.exitCode = 1;
  return pass;
}

function seed(id: string, kind: "service" | "product", priceType: string, cents: number, stock: number | null) {
  return {
    id, talent_profile_id: MAKEUP, tenant_id: TENANT, kind,
    title: `QA D45 ${kind}`, description: "synthetic",
    price_type: priceType, price_display: "exact", amount_cents: cents, currency: "EUR",
    booking_mode: "instant", reserve_mode: "full", deposit_pct: null,
    allow_pay_in_person: false, cancellation_hours: null, free_reserve_expires_days: null,
    duration_minutes: null, category: "QA", inventory_qty: stock,
    status: "published", visibility: "public", moderation_state: "approved",
    is_featured: false, sort_order: 99, attributes: {},
    title_i18n: { en: `QA D45 ${kind}` }, description_i18n: null,
  };
}

async function stockOf(id: string): Promise<number | null> {
  const { data } = await admin.from("talent_offerings").select("inventory_qty").eq("id", id).maybeSingle();
  return (data as { inventory_qty: number | null } | null)?.inventory_qty ?? null;
}

async function cleanup(inquiryIds: string[]) {
  const ids = inquiryIds.filter(Boolean);
  if (ids.length) {
    const { data: bks } = await admin.from("agency_bookings").select("id").in("source_inquiry_id", ids);
    const bkIds = (bks ?? []).map((b) => (b as { id: string }).id);
    if (bkIds.length) await admin.from("agency_bookings").delete().in("id", bkIds);
    await admin.from("inquiries").delete().in("id", ids);
  }
  await admin.from("talent_offerings").delete().in("id", [OFF_SVC, OFF_PROD]); // cascades children
}

async function main() {
  await admin.from("talent_offerings").delete().in("id", [OFF_SVC, OFF_PROD]);
  await admin.from("talent_offerings").insert([
    seed(OFF_SVC, "service", "per_person", 2000, null),
    seed(OFF_PROD, "product", "flat_package", 1500, 5),
  ] as never);
  await admin.from("talent_offering_variants").insert([
    { id: VAR_STD, offering_id: OFF_SVC, label: "Standard", amount_cents: null, sort_order: 0 },
    { id: VAR_PREM, offering_id: OFF_SVC, label: "Premium", amount_cents: 5000, sort_order: 1 },
  ] as never);
  await admin.from("talent_offering_addons").insert([
    { id: ADDON_TRAVEL, offering_id: OFF_SVC, label: "Travel outside city", amount_cents: 1500, sort_order: 0 },
  ] as never);

  const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await clientSb.auth.signInWithPassword({
    email: "qa-client-1@impronta.test",
    password: "Impronta-QA-Client-2026!",
  });
  if (!ok("client sign-in", !authErr && !!auth?.user, authErr?.message)) return;
  const user = auth!.user!;
  const inquiriesToClean: string[] = [];

  const book = (offeringId: string, extra: Record<string, unknown> = {}) =>
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
      ...extra,
    } as never);

  try {
    // ── 1. variant + extra + qty prices the order correctly ─────────────────
    const r1 = await book(OFF_SVC, { variantId: VAR_PREM, addOnIds: [ADDON_TRAVEL], quantity: 3 });
    if (ok("1. variant+extra+qty booking created", (r1 as { ok: boolean }).ok, (r1 as { ok: boolean; reason?: string; error?: string }).ok ? undefined : `${(r1 as { reason?: string }).reason}:${(r1 as { error?: string }).error}`) && (r1 as { ok: true; inquiryId: string; bookingId: string }).ok) {
      const rr = r1 as { ok: true; inquiryId: string; bookingId: string };
      inquiriesToClean.push(rr.inquiryId);

      const { data: offers } = await admin.from("inquiry_offers").select("id, total_client_price").eq("inquiry_id", rr.inquiryId);
      const offer = (offers ?? [])[0] as { id: string; total_client_price: number } | undefined;
      // Premium 50 × 3 + travel 15 = 165 EUR
      ok("   offer total = variant×qty + extra (165)", offer && Math.abs(Number(offer.total_client_price) - 165) < 0.01, `total=${offer?.total_client_price}`);

      const { data: lines } = await admin
        .from("inquiry_offer_line_items")
        .select("label, pricing_unit, units, unit_price, total_price, source_service_id, sort_order")
        .eq("offer_id", offer?.id ?? "");
      const main = (lines ?? []).find((l) => Number((l as { sort_order: number }).sort_order) === 0) as
        | { label: string; pricing_unit: string; units: number; unit_price: number; total_price: number; source_service_id: string }
        | undefined;
      const extraLine = (lines ?? []).find((l) => Number((l as { sort_order: number }).sort_order) === 1) as
        | { label: string; units: number; total_price: number }
        | undefined;
      ok("   main line: units=3 @ premium 50 → 150", main && Number(main.units) === 3 && Math.abs(Number(main.unit_price) - 50) < 0.01 && Math.abs(Number(main.total_price) - 150) < 0.01, `${main?.label} · ${main?.units} × ${main?.unit_price} = ${main?.total_price}`);
      ok("   main line label carries the variant", Boolean(main?.label.includes("Premium")), main?.label);
      ok("   extra is its own line (15)", extraLine && Math.abs(Number(extraLine.total_price) - 15) < 0.01, `${extraLine?.label} = ${extraLine?.total_price}`);
      ok("   lines stamped source_service_id", main?.source_service_id === OFF_SVC);

      const { data: snaps } = await admin.from("booking_commission_snapshot").select("gross_charged_cents").eq("booking_id", rr.bookingId);
      const gross = (snaps ?? []).reduce((s, r) => s + Number((r as { gross_charged_cents: number | null }).gross_charged_cents ?? 0), 0);
      ok("   MONEY INVARIANT gross > raw 16500", gross > 16500, `gross=${gross}`);

      const { data: inq } = await admin.from("inquiries").select("source_context, quantity").eq("id", rr.inquiryId).maybeSingle();
      const octx = ((inq as { source_context?: { offering?: Record<string, unknown> } })?.source_context ?? {}).offering ?? {};
      ok("   source_context carries selection", octx["variant_id"] === VAR_PREM && octx["quantity"] === 3 && Array.isArray(octx["add_ons"]) && (octx["add_ons"] as unknown[]).length === 1, JSON.stringify({ v: octx["variant_id"], q: octx["quantity"], a: (octx["add_ons"] as unknown[])?.length }));
      ok("   inquiry.quantity = 3", (inq as { quantity?: number })?.quantity === 3);
    }

    // ── 2. foreign variant refused ────────────────────────────────────────────
    const r2 = await book(OFF_PROD, { variantId: VAR_PREM });
    ok("2. variant of ANOTHER offering refused", !(r2 as { ok: boolean }).ok && (r2 as { error?: string }).error === "unknown_variant", `${(r2 as { reason?: string }).reason}:${(r2 as { error?: string }).error}`);

    // ── 3. product qty reserve + single release ──────────────────────────────
    ok("3. product stock starts at 5", (await stockOf(OFF_PROD)) === 5);
    const r3 = await book(OFF_PROD, { quantity: 2 });
    if (ok("   product qty=2 booking created", (r3 as { ok: boolean }).ok) && (r3 as { ok: true; inquiryId: string }).ok) {
      const rr = r3 as { ok: true; inquiryId: string };
      inquiriesToClean.push(rr.inquiryId);
      ok("   stock decremented by 2 → 3", (await stockOf(OFF_PROD)) === 3);
      const rel1 = await releaseReservedOfferingStock(rr.inquiryId, admin);
      ok("   release restores → 5", rel1 === true && (await stockOf(OFF_PROD)) === 5);
      const rel2 = await releaseReservedOfferingStock(rr.inquiryId, admin);
      ok("   second release is a NO-OP (flag cleared)", rel2 === false && (await stockOf(OFF_PROD)) === 5, `stock=${await stockOf(OFF_PROD)}`);
    }

    // ── 4. oversell refused at qty level ─────────────────────────────────────
    const r4 = await book(OFF_PROD, { quantity: 9 });
    ok("4. qty beyond stock refused (sold_out)", !(r4 as { ok: boolean }).ok && (r4 as { error?: string }).error === "sold_out", `${(r4 as { error?: string }).error} · stock=${await stockOf(OFF_PROD)}`);
    ok("   stock unchanged after refused oversell", (await stockOf(OFF_PROD)) === 5);
  } finally {
    await cleanup(inquiriesToClean);
    console.log("\nvariants+qty QA complete (synthetic rows cleaned).");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
