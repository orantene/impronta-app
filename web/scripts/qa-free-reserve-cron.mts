/**
 * QA — free-reserve expiry cron + stock-release, end to end on the real rail.
 *
 * Seeds a synthetic INSTANT + FREE-RESERVE PRODUCT offering (stock 5), books it
 * as the QA client (reserving 1 unit → 4), then proves:
 *   1. releaseReservedOfferingStock restores a reserved unit (the cancel path).
 *   2. A fresh free reserve is NOT swept (window not elapsed).
 *   3. A backdated free reserve IS swept: booking cancelled, txn voided, product
 *      stock restored, and a booking_cancelled inquiry event emitted.
 *   4. A FULL-reserve booking is never swept by the free-reserve cron.
 * Cleans up every synthetic row at the end (offerings + bookings + inquiries).
 *
 * Run: set -a; source .env.local; source .env.vercel.local; set +a; \
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-free-reserve-cron.mts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createInstantBooking } from "./qa-instant-book-compat";
import { sweepExpiredFreeReserves } from "../src/app/api/cron/expire-free-reserves/logic";
import { releaseReservedOfferingStock } from "../src/lib/talent/offering-stock";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT = "00000000-0000-0000-0000-000000000001";
const MAKEUP = "eb97dc64-af2b-4996-a48c-913a143cfa59";

const OFF_FREE_PRODUCT = "0f0e0009-0000-4000-8000-000000000009"; // synthetic: product, instant, free reserve, stock 5
const OFF_FULL_PRODUCT = "0f0e0009-0000-4000-8000-000000000010"; // synthetic: product, instant, FULL reserve (control)

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as SupabaseClient;

function ok(name: string, cond: unknown, extra = "") {
  const pass = Boolean(cond);
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!pass) process.exitCode = 1;
  return pass;
}

async function stockOf(id: string): Promise<number | null> {
  const { data } = await admin.from("talent_offerings").select("inventory_qty").eq("id", id).maybeSingle();
  return (data as { inventory_qty: number | null } | null)?.inventory_qty ?? null;
}

function offeringSeed(id: string, reserveMode: "free" | "full", freeDays: number | null) {
  return {
    id,
    talent_profile_id: MAKEUP,
    tenant_id: TENANT,
    kind: "product",
    title: `QA free-reserve ${reserveMode}`,
    description: "synthetic QA product",
    price_type: "flat_package",
    price_display: "exact",
    amount_cents: 1500,
    currency: "EUR",
    booking_mode: "instant",
    reserve_mode: reserveMode,
    deposit_pct: null,
    allow_pay_in_person: false,
    cancellation_hours: null,
    free_reserve_expires_days: freeDays,
    duration_minutes: null,
    category: "QA",
    inventory_qty: 5,
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    is_featured: false,
    sort_order: 99,
    attributes: {},
    title_i18n: { en: `QA free-reserve ${reserveMode}` },
    description_i18n: null,
  };
}

async function cleanup(inquiryIds: string[]) {
  const ids = inquiryIds.filter(Boolean);
  if (ids.length) {
    const { data: bks } = await admin.from("agency_bookings").select("id").in("source_inquiry_id", ids);
    const bkIds = (bks ?? []).map((b) => (b as { id: string }).id);
    if (bkIds.length) await admin.from("agency_bookings").delete().in("id", bkIds);
    await admin.from("inquiries").delete().in("id", ids);
  }
  await admin.from("talent_offerings").delete().in("id", [OFF_FREE_PRODUCT, OFF_FULL_PRODUCT]);
}

async function main() {
  // Fresh seeds (idempotent: clear any leftovers first).
  await admin.from("talent_offerings").delete().in("id", [OFF_FREE_PRODUCT, OFF_FULL_PRODUCT]);
  await admin.from("talent_offerings").insert([
    offeringSeed(OFF_FREE_PRODUCT, "free", 1),
    offeringSeed(OFF_FULL_PRODUCT, "full", null),
  ] as never);

  const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await clientSb.auth.signInWithPassword({
    email: "qa-client-1@impronta.test",
    password: "Impronta-QA-Client-2026!",
  });
  if (!ok("client sign-in", !authErr && !!auth?.user, authErr?.message)) return;
  const user = auth!.user!;
  const inquiriesToClean: string[] = [];

  const book = async (offeringId: string) =>
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
    ok("seed stock starts at 5", (await stockOf(OFF_FREE_PRODUCT)) === 5);

    // ── 1. release helper restores a reserved unit ──────────────────────────
    const rRel = await book(OFF_FREE_PRODUCT);
    if (ok("1. booking A created (reserves 1 → 4)", rRel.ok) && rRel.ok) {
      inquiriesToClean.push(rRel.inquiryId);
      ok("   stock decremented to 4", (await stockOf(OFF_FREE_PRODUCT)) === 4);
      const released = await releaseReservedOfferingStock(rRel.inquiryId, admin);
      ok("   releaseReservedOfferingStock returns true", released === true);
      ok("   stock restored to 5", (await stockOf(OFF_FREE_PRODUCT)) === 5);
    }

    // ── 2. fresh free reserve is NOT swept ──────────────────────────────────
    const rFresh = await book(OFF_FREE_PRODUCT);
    if (ok("2. booking B created (fresh, reserves 1 → 4)", rFresh.ok) && rFresh.ok) {
      inquiriesToClean.push(rFresh.inquiryId);
      const s1 = await sweepExpiredFreeReserves(admin, { now: new Date() });
      ok("   sweep leaves the fresh reserve alone", !s1.ids.includes(rFresh.bookingId), `cancelled=${s1.cancelled}`);
      const { data: bk } = await admin.from("agency_bookings").select("status").eq("id", rFresh.bookingId).maybeSingle();
      ok("   fresh booking still live", ["confirmed", "tentative"].includes(String((bk as { status?: string })?.status)));
    }

    // ── 3. backdated free reserve IS swept (cancel + stock + event) ──────────
    const rStale = await book(OFF_FREE_PRODUCT);
    if (ok("3. booking C created (will be backdated)", rStale.ok) && rStale.ok) {
      inquiriesToClean.push(rStale.inquiryId);
      const stockAfterC = await stockOf(OFF_FREE_PRODUCT); // expect 3 (B and C both reserved)
      // Age it beyond the 1-day hold.
      await admin
        .from("agency_bookings")
        .update({ created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
        .eq("id", rStale.bookingId);
      const s2 = await sweepExpiredFreeReserves(admin, { now: new Date() });
      ok("   sweep cancels the stale reserve", s2.ids.includes(rStale.bookingId), `ids=${s2.ids.join(",")}`);
      const { data: bk } = await admin.from("agency_bookings").select("status").eq("id", rStale.bookingId).maybeSingle();
      ok("   stale booking now cancelled", String((bk as { status?: string })?.status) === "cancelled");
      const { data: tx } = await admin.from("booking_transactions").select("status").eq("booking_id", rStale.bookingId);
      ok("   draft transaction voided", (tx ?? []).every((t) => String((t as { status: string }).status) === "cancelled"), (tx ?? []).map((t) => (t as { status: string }).status).join(","));
      ok("   product stock returned", (await stockOf(OFF_FREE_PRODUCT)) === (stockAfterC ?? 0) + 1);
      const { data: evts } = await admin.from("inquiry_events").select("event_type").eq("inquiry_id", rStale.inquiryId);
      ok("   booking_cancelled event emitted", (evts ?? []).some((e) => String((e as { event_type: string }).event_type).includes("cancel")), (evts ?? []).map((e) => (e as { event_type: string }).event_type).join(","));
    }

    // ── 4. FULL-reserve booking is never touched by the free-reserve cron ────
    const rFull = await book(OFF_FULL_PRODUCT);
    if (ok("4. FULL-reserve control booking created", rFull.ok) && rFull.ok) {
      inquiriesToClean.push(rFull.inquiryId);
      await admin
        .from("agency_bookings")
        .update({ created_at: new Date(Date.now() - 30 * 86_400_000).toISOString() })
        .eq("id", rFull.bookingId);
      const s3 = await sweepExpiredFreeReserves(admin, { now: new Date() });
      ok("   full-reserve booking is NOT swept", !s3.ids.includes(rFull.bookingId), `ids=${s3.ids.join(",")}`);
    }
  } finally {
    await cleanup(inquiriesToClean);
    console.log("\nfree-reserve cron QA complete (synthetic rows cleaned).");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
