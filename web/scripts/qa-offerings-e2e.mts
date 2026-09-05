/**
 * QA — offerings → direct booking E2E over the REAL money rail (pre-launch DB).
 *
 * Drives createInstantBooking exactly as the server action does (client session
 * via password sign-in), then asserts the downstream records: booking,
 * commission snapshot (gross > raw price — the surcharge invariant), the
 * transaction state per payment method, the source_service_id stamp, and the
 * calendar-visible booking row. Also proves the quote-offering guard refuses.
 *
 * Run: set -a; source .env.local; source .env.vercel.local; set +a; \
 *      NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx scripts/qa-offerings-e2e.mts
 */

import { createClient } from "@supabase/supabase-js";
import { createInstantBooking } from "./qa-instant-book-compat";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TENANT = "00000000-0000-0000-0000-000000000001"; // impronta

const MORENA_TALENT = "eb97dc64-af2b-4996-a48c-913a143cfa59"; // TAL-AUDIT-0512 makeup artist
const OFF_BRIDAL_TRIAL = "0f0e0001-0000-4000-8000-000000000001"; // 120 EUR instant + cash ok
const OFF_QUOTE = "0f0e0001-0000-4000-8000-000000000004"; // quote — must refuse
const DJ_TALENT = "e2df1bd4-c768-464d-a377-d819d9b0ddcf"; // Popi TAL-00039
const OFF_DJ_SET = "0f0e0003-0000-4000-8000-000000000001"; // 400 EUR instant, card only

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

function ok(name: string, cond: unknown, extra = "") {
  const pass = Boolean(cond);
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!pass) process.exitCode = 1;
  return pass;
}

async function inspectBooking(bookingId: string, inquiryId: string) {
  const [{ data: bk }, { data: snap }, { data: txns }, { data: lines }] = await Promise.all([
    admin.from("agency_bookings").select("id,status,payment_status,event_date,tenant_id").eq("id", bookingId).maybeSingle(),
    admin.from("booking_commission_snapshot").select("gross_charged_cents,talent_net_cents,workspace_fee_cents,platform_fee_cents").eq("booking_id", bookingId),
    admin.from("booking_transactions").select("id,status,gross_amount_cents,checkout_type").eq("booking_id", bookingId),
    admin.from("inquiry_offer_line_items").select("label,pricing_unit,unit_price,total_price,source_service_id").eq("talent_profile_id", MORENA_TALENT).limit(50),
  ]);
  const inqLines = (lines ?? []).filter(() => true);
  return { bk, snaps: snap ?? [], txns: txns ?? [], inqLines, inquiryId };
}

async function main() {
  // ── Sign in as the QA client (real session — the convert RPC gates on auth.uid())
  const clientSb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await clientSb.auth.signInWithPassword({
    email: "qa-client-1@impronta.test",
    password: "Impronta-QA-Client-2026!",
  });
  if (!ok("client sign-in", !authErr && !!auth?.user, authErr?.message)) return;
  const user = auth!.user!;

  // ════ 1. CARD instant booking — makeup artist "Bridal makeup trial" (120 EUR) ════
  const r1 = await createInstantBooking(clientSb as never, {
    tenantId: TENANT,
    talentProfileId: MORENA_TALENT,
    clientUserId: user.id,
    actorUserId: user.id,
    contactName: "QA Client One",
    contactEmail: "qa-client-1@impronta.test",
    sourcePage: "/t/TAL-AUDIT-0512",
    currencyCode: "EUR",
    offeringId: OFF_BRIDAL_TRIAL,
    payInPerson: false,
  });
  if (ok("1. card booking created", r1.ok, r1.ok ? `booking ${r1.bookingId}` : `${(r1 as { reason?: string }).reason}: ${(r1 as { error?: string }).error ?? ""}`) && r1.ok) {
    const d = await inspectBooking(r1.bookingId, r1.inquiryId);
    ok("   booking row exists + confirmed", d.bk && ["confirmed", "tentative"].includes(String(d.bk.status)), String(d.bk?.status));
    const gross = d.snaps.reduce((s, r) => s + Number(r.gross_charged_cents ?? 0), 0);
    ok("   commission snapshot persisted", d.snaps.length > 0, `${d.snaps.length} rows`);
    ok("   MONEY INVARIANT gross > raw 12000", gross > 12000, `gross=${gross}`);
    const t = d.txns[0];
    ok("   card txn drafted (no payout account → staff requests later)", t && ["draft", "payment_requested"].includes(String(t.status)), `status=${t?.status} gross=${t?.gross_amount_cents}`);
    // W2-A: the offering reserves with a 30% DEPOSIT → the billed slice must be
    // checkout_type='deposit' at ~30% of the snapshot gross (never the raw price).
    ok("   W2-A deposit reserve: checkout_type=deposit @30% of gross",
       t && t.checkout_type === "deposit" && Math.abs(Number(t.gross_amount_cents) - Math.round(gross * 0.3)) <= 1,
       `type=${t?.checkout_type} billed=${t?.gross_amount_cents} vs 30% of ${gross}=${Math.round(gross*0.3)}`);
    // Deposit-aware: the billed slice must derive from the SNAPSHOT gross
    // (full for 'full' reserve, pct-of-gross for 'deposit') — never the raw price.
    ok("   charge derives from snapshot gross (never raw)",
       t && (Number(t.gross_amount_cents) === gross || Math.abs(Number(t.gross_amount_cents) - Math.round(gross * 0.3)) <= 1),
       `billed=${t?.gross_amount_cents} gross=${gross}`);
    const stamped = d.inqLines.find((l) => l.source_service_id === OFF_BRIDAL_TRIAL);
    ok("   offer line stamped source_service_id + unit", !!stamped && stamped.pricing_unit === "per_contact", `${stamped?.label} · ${stamped?.pricing_unit} · ${stamped?.unit_price}`);
    const { data: inq } = await admin.from("inquiries").select("source_channel,source_context,status").eq("id", r1.inquiryId).maybeSingle();
    const off = (inq?.source_context as { offering?: { offering_id?: string } } | null)?.offering;
    ok("   inquiry carries source_context.offering", off?.offering_id === OFF_BRIDAL_TRIAL, `channel=${inq?.source_channel} status=${inq?.status}`);
  }

  // ════ 2. PAY-IN-PERSON booking — same offering, cash path ════
  const r2 = await createInstantBooking(clientSb as never, {
    tenantId: TENANT,
    talentProfileId: MORENA_TALENT,
    clientUserId: user.id,
    actorUserId: user.id,
    contactName: "QA Client One",
    contactEmail: "qa-client-1@impronta.test",
    sourcePage: "/t/TAL-AUDIT-0512",
    currencyCode: "EUR",
    offeringId: OFF_BRIDAL_TRIAL,
    payInPerson: true,
  });
  if (ok("2. pay-in-person booking created", r2.ok, r2.ok ? `booking ${r2.bookingId}` : `${(r2 as { reason?: string }).reason}`) && r2.ok) {
    const { data: t2 } = await admin.from("booking_transactions").select("status,gross_amount_cents").eq("booking_id", r2.bookingId);
    const t = (t2 ?? [])[0];
    ok("   transaction stays DRAFT (no card request)", t && t.status === "draft", `status=${t?.status}`);
    const { data: inq2 } = await admin.from("inquiries").select("source_context").eq("id", r2.inquiryId).maybeSingle();
    const off2 = (inq2?.source_context as { offering?: { pay_in_person?: boolean } } | null)?.offering;
    ok("   provenance marks pay_in_person", off2?.pay_in_person === true);
  }

  // ════ 3. GUARD — a quote offering must be UNCHARGE-ABLE ════
  const r3 = await createInstantBooking(clientSb as never, {
    tenantId: TENANT,
    talentProfileId: MORENA_TALENT,
    clientUserId: user.id,
    actorUserId: user.id,
    contactName: "QA Client One",
    contactEmail: "qa-client-1@impronta.test",
    currencyCode: "EUR",
    offeringId: OFF_QUOTE,
  });
  ok("3. quote offering REFUSED (uncharge-able)", !r3.ok && (r3 as { reason?: string }).reason === "instant_book_not_enabled", (r3 as { reason?: string }).reason);

  // ════ 4. DJ instant booking — different talent + unit (event, 400 EUR) ════
  const r4 = await createInstantBooking(clientSb as never, {
    tenantId: TENANT,
    talentProfileId: DJ_TALENT,
    clientUserId: user.id,
    actorUserId: user.id,
    contactName: "QA Client One",
    contactEmail: "qa-client-1@impronta.test",
    sourcePage: "/t/TAL-00039",
    currencyCode: "EUR",
    offeringId: OFF_DJ_SET,
  });
  if (ok("4. DJ instant booking created", r4.ok, r4.ok ? `booking ${r4.bookingId}` : `${(r4 as { reason?: string }).reason}: ${(r4 as { error?: string }).error ?? ""}`) && r4.ok) {
    const { data: snap } = await admin.from("booking_commission_snapshot").select("gross_charged_cents").eq("booking_id", r4.bookingId);
    const gross = (snap ?? []).reduce((s, r) => s + Number(r.gross_charged_cents ?? 0), 0);
    ok("   DJ gross > raw 40000", gross > 40000, `gross=${gross}`);
    const { data: line } = await admin.from("inquiry_offer_line_items").select("pricing_unit,source_service_id").eq("talent_profile_id", DJ_TALENT).eq("source_service_id", OFF_DJ_SET).limit(1);
    ok("   DJ line unit=event + stamp", (line ?? [])[0]?.pricing_unit === "event");
    // W2-A: DJ set is FREE RESERVE → booking stands, txn drafted, no payment request.
    const { data: djTx } = await admin.from("booking_transactions").select("status,checkout_type").eq("booking_id", r4.bookingId);
    ok("   W2-A free reserve: txn stays draft (no card request)", (djTx ?? [])[0]?.status === "draft", `status=${(djTx ?? [])[0]?.status}`);
  }

  // ════ 4b. CARD + payout-account talent — payment_requested proof (More) ════
  const r5 = await createInstantBooking(clientSb as never, {
    tenantId: TENANT,
    talentProfileId: "1d6bcec0-874d-427d-90ce-9f9c8f0e8929", // More TAL-00045 (has payout account)
    clientUserId: user.id,
    actorUserId: user.id,
    contactName: "QA Client One",
    contactEmail: "qa-client-1@impronta.test",
    sourcePage: "/t/TAL-00045",
    currencyCode: "EUR",
    offeringId: "0f0e0002-0000-4000-8000-000000000005", // casting 80 EUR instant
  });
  if (ok("4b. More instant booking (payout-account talent)", r5.ok, r5.ok ? `booking ${r5.bookingId}` : `${(r5 as { reason?: string }).reason}: ${(r5 as { error?: string }).error ?? ""}`) && r5.ok) {
    const { data: t5 } = await admin.from("booking_transactions").select("status,gross_amount_cents").eq("booking_id", r5.bookingId);
    ok("   card txn payment_requested (payment card issued)", (t5 ?? [])[0]?.status === "payment_requested", `status=${(t5 ?? [])[0]?.status} gross=${(t5 ?? [])[0]?.gross_amount_cents}`);
    const { data: evts } = await admin.from("inquiry_events").select("event_type").eq("inquiry_id", r5.inquiryId);
    ok("   thread/event stream carries payment events (Messages shell)", (evts ?? []).some((m) => String(m.event_type).includes("payment")), (evts ?? []).map((m) => m.event_type).join(","));
  }

  // ════ 5. Calendar visibility — bookings appear for the talent(s) ════
  const bookingIds = [r1.ok ? r1.bookingId : null, r4.ok ? r4.bookingId : null].filter(Boolean) as string[];
  if (bookingIds.length) {
    const { data: cal } = await admin
      .from("booking_talent")
      .select("booking_id, talent_profile_id")
      .in("booking_id", bookingIds);
    ok("5. bookings carry talent links (calendar source)", (cal ?? []).length >= bookingIds.length, `${(cal ?? []).length} links for ${bookingIds.length} bookings`);
  }

  console.log("\nQA run complete.");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
