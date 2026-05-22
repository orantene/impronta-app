/**
 * qa-xtenant-commission-e2e.mts — end-to-end commission pipeline test (2026-05-22).
 *
 * Drives one QAX inquiry through the full engine path:
 *   engine_send_offer (with line items)
 *   → engine_submit_approval (all participants)
 *   → engine_convert_to_booking  (requires real user JWT — signs in as qa-admin)
 *   → engine_load_commission_context + resolveBookingCommissions
 *   → engine_persist_booking_commission_snapshot
 *
 * Then asserts a booking_commission_snapshot row exists with lanes summing
 * to gross. Tears everything down afterward via service-role deletes.
 *
 * This is the manual companion to commission-pipeline.integration.test.ts.
 * Run it interactively; it will print a plan and ask for confirmation before
 * writing anything.
 *
 * Run:  npx tsx scripts/qa-xtenant-commission-e2e.mts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   QA_ADMIN_EMAIL   (default: qa-admin@impronta.test)
 *   QA_ADMIN_PASSWORD (default: Impronta-QA-Admin-2026!)
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import {
  resolveBookingCommissions,
  type PlatformCommissionConfig,
  type WorkspaceCommissionOverride,
  type WorkspacePlanTier,
  type PaymentMethod,
} from "../src/lib/billing/commission";

// ── Environment ───────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function normalizePlan(raw: string | null | undefined): WorkspacePlanTier {
  switch (raw) {
    case "free":
    case "studio":
    case "agency":
    case "network":
      return raw;
    case "hub-network":
    case "hub_network":
      return "network";
    default:
      return "free";
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────────

async function confirm(msg: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n${msg} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "y");
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(`ASSERT FAILED: ${msg}`);
}

function ok(label: string, detail = "") {
  console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`);
}

function info(label: string, detail = "") {
  console.log(`  · ${label}${detail ? "  " + detail : ""}`);
}

function fail(label: string) {
  console.error(`  ✗ ${label}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const QA_EMAIL = env.QA_ADMIN_EMAIL ?? "qa-admin@impronta.test";
const QA_PASSWORD = env.QA_ADMIN_PASSWORD ?? "Impronta-QA-Admin-2026!";

assert(!!SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL missing from .env.local");
assert(!!ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local");
assert(!!SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

// Service-role client: bypasses RLS, used for setup / teardown / assertion.
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// QAX fixture inquiry IDs.
const { ids: QAX_IDS } = JSON.parse(
  readFileSync(new URL("../.qa-xtenant-ids.json", import.meta.url), "utf8"),
) as { ids: string[] };

// Line items for the test offer: 2 units @ $500 client / $350 talent each.
// Stored as NUMERIC(12,2) dollars on inquiry_offer_line_items (not cents).
const LI_UNITS = 2;
const LI_UNIT_PRICE = 500.0; // dollars
const LI_TALENT_COST = 350.0; // dollars
const LI_TOTAL_PRICE = LI_UNITS * LI_UNIT_PRICE; // 1000.00

// Override reason — passed to engine_convert_to_booking.
// Only used if the inquiry has unfulfilled requirement groups (super_admin path).
const OVERRIDE_REASON = "QA e2e pipeline test — automated override";

// ── Step 1: Probe (read-only) ─────────────────────────────────────────────────

console.log("\n══ QAX commission e2e — probe ════════════════════════════════════");
console.log(`Supabase: ${SUPABASE_URL}`);
console.log(`QAX fixture count: ${QAX_IDS.length}`);

// Load all QAX inquiries and pick the first that is not booked and not frozen.
const { data: inquiries, error: iqErr } = await sb
  .from("inquiries")
  .select("id, status, version, is_frozen, booked_at, tenant_id, current_offer_id, client_user_id, next_action_by, last_edited_by, last_edited_at")
  .in("id", QAX_IDS);

assert(!iqErr, `Failed to load QAX inquiries: ${iqErr?.message}`);
assert((inquiries?.length ?? 0) > 0, "No QAX inquiries found — check .qa-xtenant-ids.json");

type InquiryRow = {
  id: string;
  status: string;
  version: number;
  is_frozen: boolean;
  booked_at: string | null;
  tenant_id: string;
  current_offer_id: string | null;
  client_user_id: string | null;
  next_action_by: string | null;
  last_edited_by: string | null;
  last_edited_at: string | null;
};

const allInquiries = inquiries as InquiryRow[];
for (const iq of allInquiries) {
  info(
    `inquiry ${iq.id}`,
    `status=${iq.status} version=${iq.version} frozen=${iq.is_frozen} booked=${!!iq.booked_at}`,
  );
}

const targetMaybe = allInquiries.find((iq) => !iq.is_frozen && !iq.booked_at);
if (!targetMaybe) {
  throw new Error("No suitable QAX inquiry found (all are frozen or already booked). Cannot run test.");
}
const target: InquiryRow = targetMaybe;

ok(`Selected inquiry`, `${target.id}  status=${target.status}  version=${target.version}`);

// Load qa-admin profile to get actor user ID.
const { data: adminProfile } = await sb
  .from("profiles")
  .select("id, app_role")
  .eq("email", QA_EMAIL)
  .maybeSingle();

const actorUserId = adminProfile?.id as string | undefined;
assert(!!actorUserId, `qa-admin profile not found for email: ${QA_EMAIL}`);
info("actor", `${actorUserId} role=${adminProfile?.app_role}`);

// Load any existing 'sent' offer on this inquiry — we'll restore it after teardown.
const { data: existingSentOffer } = await sb
  .from("inquiry_offers")
  .select("id, version, status")
  .eq("inquiry_id", target.id)
  .eq("status", "sent")
  .maybeSingle();

if (existingSentOffer) {
  info("pre-existing sent offer", `${existingSentOffer.id} — will restore after teardown`);
}

// ── Announce plan ─────────────────────────────────────────────────────────────

console.log("\n══ Plan ══════════════════════════════════════════════════════════");
console.log(`Inquiry:    ${target.id}`);
console.log(`Status now: ${target.status}  version=${target.version}`);
console.log(`Tenant:     ${target.tenant_id}`);
console.log("Will write:");
console.log("  • INSERT inquiry_offers (draft)");
console.log("  • INSERT inquiry_offer_line_items (2 × $500 client / $350 talent)");
console.log("  • RPC  engine_send_offer   → status='sent', inquiry='offer_pending'");
console.log("  • RPC  engine_submit_approval × N  → status='accepted', inquiry='approved'");
console.log("  • Sign in as qa-admin, RPC engine_convert_to_booking → booking_id");
console.log("  • RPC  engine_load_commission_context + resolver + persist → snapshot row");
console.log("  • Assert booking_commission_snapshot.lanes_sum = gross");
console.log("Will delete:");
console.log("  • booking_commission_snapshot  (+ any movements/balances if payment=cash)");
console.log("  • booking_talent, agency_bookings");
console.log("  • inquiry_approvals, inquiry_offer_line_items, inquiry_offers (test offer only)");
console.log("  • Restore inquiry to current state (status/version/booked_at/offer_id)");
if (existingSentOffer) {
  console.log(`  • Restore pre-existing sent offer ${existingSentOffer.id} → status='sent'`);
}

const go = await confirm("Proceed? This will write to the live production DB.");
if (!go) {
  console.log("\nAborted — no writes made.");
  process.exit(0);
}

// ── Snapshot: save pre-test inquiry state ─────────────────────────────────────

const preTest = {
  status: target.status,
  version: target.version,
  booked_at: target.booked_at,
  current_offer_id: target.current_offer_id,
  next_action_by: target.next_action_by,
  last_edited_by: target.last_edited_by,
  last_edited_at: target.last_edited_at,
};

let testOfferId: string | null = null;
let testBookingId: string | null = null;

// Teardown function — called in finally regardless of success/failure.
async function teardown() {
  console.log("\n══ Teardown ══════════════════════════════════════════════════════");

  if (testBookingId) {
    // Delete commission snapshot.
    const { error: e1 } = await sb
      .from("booking_commission_snapshot")
      .delete()
      .eq("booking_id", testBookingId);
    if (e1) fail(`Delete booking_commission_snapshot: ${e1.message}`);
    else ok("Deleted booking_commission_snapshot");

    // Delete commission movements (if payment was off-platform).
    const { error: e2 } = await sb
      .from("platform_commission_movements")
      .delete()
      .eq("booking_id", testBookingId);
    if (e2) fail(`Delete platform_commission_movements: ${e2.message}`);
    else ok("Deleted platform_commission_movements (0 expected for card payment)");

    // Delete booking_talent.
    const { error: e3 } = await sb
      .from("booking_talent")
      .delete()
      .eq("booking_id", testBookingId);
    if (e3) fail(`Delete booking_talent: ${e3.message}`);
    else ok("Deleted booking_talent rows");

    // Delete agency_bookings.
    const { error: e4 } = await sb
      .from("agency_bookings")
      .delete()
      .eq("id", testBookingId);
    if (e4) fail(`Delete agency_bookings: ${e4.message}`);
    else ok("Deleted agency_bookings row");
  }

  if (testOfferId) {
    // Delete inquiry_approvals for the test offer.
    const { error: e5 } = await sb
      .from("inquiry_approvals")
      .delete()
      .eq("offer_id", testOfferId);
    if (e5) fail(`Delete inquiry_approvals: ${e5.message}`);
    else ok("Deleted inquiry_approvals");

    // Delete inquiry_offer_line_items (cascade from offer delete handles this,
    // but explicit delete is clearer and handles any cascade gap).
    const { error: e6 } = await sb
      .from("inquiry_offer_line_items")
      .delete()
      .eq("offer_id", testOfferId);
    if (e6) fail(`Delete inquiry_offer_line_items: ${e6.message}`);
    else ok("Deleted inquiry_offer_line_items");

    // Delete the test inquiry_offers row.
    const { error: e7 } = await sb
      .from("inquiry_offers")
      .delete()
      .eq("id", testOfferId);
    if (e7) fail(`Delete inquiry_offers: ${e7.message}`);
    else ok("Deleted test offer");
  }

  // Restore any pre-existing sent offer.
  if (existingSentOffer) {
    const { error: e8 } = await sb
      .from("inquiry_offers")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", existingSentOffer.id);
    if (e8) fail(`Restore pre-existing sent offer: ${e8.message}`);
    else ok(`Restored pre-existing sent offer ${existingSentOffer.id}`);
  }

  // Restore inquiry to pre-test state.
  const { error: e9 } = await sb
    .from("inquiries")
    .update({
      status: preTest.status,
      version: preTest.version,
      booked_at: preTest.booked_at,
      current_offer_id: preTest.current_offer_id,
      next_action_by: preTest.next_action_by,
      last_edited_by: preTest.last_edited_by,
      last_edited_at: preTest.last_edited_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);
  if (e9) fail(`Restore inquiry: ${e9.message}`);
  else ok(`Restored inquiry to status=${preTest.status} version=${preTest.version}`);

  // ── Verify teardown ────────────────────────────────────────────────────────

  console.log("\n── Verify teardown ─────────────────────────────────────────────");

  if (testBookingId) {
    const { count: snapCount } = await sb
      .from("booking_commission_snapshot")
      .select("booking_id", { count: "exact", head: true })
      .eq("booking_id", testBookingId);
    if ((snapCount ?? 0) === 0) ok("booking_commission_snapshot  0 rows for test booking");
    else fail(`booking_commission_snapshot  ${snapCount} rows remain — teardown incomplete`);

    const { count: bkCount } = await sb
      .from("agency_bookings")
      .select("id", { count: "exact", head: true })
      .eq("id", testBookingId);
    if ((bkCount ?? 0) === 0) ok("agency_bookings  0 rows for test booking");
    else fail(`agency_bookings  ${bkCount} rows remain`);
  }

  if (testOfferId) {
    const { count: offerCount } = await sb
      .from("inquiry_offers")
      .select("id", { count: "exact", head: true })
      .eq("id", testOfferId);
    if ((offerCount ?? 0) === 0) ok("inquiry_offers  0 rows for test offer");
    else fail(`inquiry_offers  ${offerCount} rows remain`);
  }

  const { data: restoredIq } = await sb
    .from("inquiries")
    .select("status, version, booked_at")
    .eq("id", target.id)
    .single();
  if (
    restoredIq?.status === preTest.status &&
    restoredIq?.version === preTest.version &&
    restoredIq?.booked_at === preTest.booked_at
  ) {
    ok(`inquiry restored  status=${restoredIq.status} version=${restoredIq.version}`);
  } else {
    fail(
      `inquiry NOT fully restored — got status=${restoredIq?.status} version=${restoredIq?.version}`,
    );
  }
}

try {
  // ── Step 2: Setup — insert offer + line items ─────────────────────────────

  console.log("\n══ Setup ════════════════════════════════════════════════════════");

  const { data: offer, error: offerErr } = await sb
    .from("inquiry_offers")
    .insert({
      inquiry_id: target.id,
      tenant_id: target.tenant_id,
      status: "draft",
      version: 1,
      currency_code: "MXN",
      total_client_price: LI_TOTAL_PRICE,
      notes: "QA e2e pipeline test offer — will be deleted",
    })
    .select("id, version")
    .single();

  assert(!offerErr, `Insert inquiry_offers: ${offerErr?.message}`);
  testOfferId = offer.id as string;
  ok(`Created offer`, `${testOfferId}`);

  const { error: liErr } = await sb.from("inquiry_offer_line_items").insert({
    offer_id: testOfferId,
    tenant_id: target.tenant_id,
    label: "QA test talent fee",
    pricing_unit: "event",
    units: LI_UNITS,
    unit_price: LI_UNIT_PRICE,
    total_price: LI_TOTAL_PRICE,
    talent_cost: LI_TALENT_COST * LI_UNITS,
    sort_order: 0,
  });

  assert(!liErr, `Insert inquiry_offer_line_items: ${liErr?.message}`);
  ok("Created line item", `${LI_UNITS} × $${LI_UNIT_PRICE} client / $${LI_TALENT_COST} talent`);

  // ── Step 3: engine_send_offer ─────────────────────────────────────────────

  console.log("\n══ engine_send_offer ═════════════════════════════════════════════");

  // Read fresh inquiry version — could differ from preTest.version if another
  // concurrent operation changed it (unlikely in QA, but defensive).
  const { data: freshIq } = await sb
    .from("inquiries")
    .select("version")
    .eq("id", target.id)
    .single();
  const inquiryVersionBeforeSend = freshIq!.version as number;

  const { data: sendResult, error: sendErr } = await sb.rpc("engine_send_offer", {
    p_inquiry_id: target.id,
    p_offer_id: testOfferId,
    p_actor_user_id: actorUserId,
    p_inquiry_expected_version: inquiryVersionBeforeSend,
    p_offer_expected_version: 1,
  });

  assert(!sendErr, `engine_send_offer: ${sendErr?.message}`);
  const sendRows = sendResult as Array<{ next_inquiry_version: number; next_offer_version: number }>;
  const versionAfterSend = sendRows[0]?.next_inquiry_version ?? inquiryVersionBeforeSend + 1;
  ok("engine_send_offer", `inquiry version now ${versionAfterSend}`);

  // ── Step 4: engine_submit_approval for all participants ────────────────────

  console.log("\n══ engine_submit_approval ════════════════════════════════════════");

  const { data: approvals, error: appErr } = await sb
    .from("inquiry_approvals")
    .select("id, participant_id, status")
    .eq("offer_id", testOfferId);

  assert(!appErr, `Load approvals: ${appErr?.message}`);
  assert((approvals?.length ?? 0) > 0, "No approvals were seeded by engine_send_offer");

  info(`${approvals!.length} approval(s) seeded`);

  // All approvals use the SAME expected version (partial approvals don't bump).
  // Only the final one triggers the version bump.
  let _versionAfterApprovals = versionAfterSend;
  for (const appr of approvals!) {
    const { data: apprResult, error: apprErr } = await sb.rpc("engine_submit_approval", {
      p_inquiry_id: target.id,
      p_offer_id: testOfferId,
      p_participant_id: appr.participant_id,
      p_actor_user_id: actorUserId,
      p_inquiry_expected_version: versionAfterSend,
      p_decision: "accepted",
    });

    assert(!apprErr, `engine_submit_approval for ${appr.participant_id}: ${apprErr?.message}`);
    const result = apprResult as { already: boolean; transition: string; next_inquiry_version: number };
    _versionAfterApprovals = result.next_inquiry_version;
    ok(
      `Approval ${appr.participant_id.slice(0, 8)}…`,
      `transition=${result.transition} next_version=${result.next_inquiry_version}`,
    );
  }

  // Verify offer is now accepted.
  const { data: acceptedOffer } = await sb
    .from("inquiry_offers")
    .select("status")
    .eq("id", testOfferId)
    .single();
  assert(acceptedOffer?.status === "accepted", `Offer status should be 'accepted', got '${acceptedOffer?.status}'`);
  ok("Offer status", "accepted");

  // Verify inquiry is now approved.
  const { data: approvedIq } = await sb
    .from("inquiries")
    .select("status, version")
    .eq("id", target.id)
    .single();
  assert(approvedIq?.status === "approved", `Inquiry status should be 'approved', got '${approvedIq?.status}'`);
  ok("Inquiry status", `approved  version=${approvedIq!.version}`);
  const versionBeforeConvert = approvedIq!.version as number;

  // ── Step 5: engine_convert_to_booking (user JWT required) ─────────────────

  console.log("\n══ engine_convert_to_booking ═════════════════════════════════════");
  console.log(`  Signing in as ${QA_EMAIL}…`);

  // Must use anon-key client + signInWithPassword so auth.uid() is set in RPCs.
  const anonSb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: signInData, error: signInErr } = await anonSb.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });
  assert(!signInErr, `Sign-in failed: ${signInErr?.message}`);
  assert(!!signInData.session?.access_token, "No access token after sign-in");

  const qaAdminUserId = signInData.user!.id;
  ok("Signed in", `user_id=${qaAdminUserId}`);

  // Authenticated client: auth.uid() will equal qaAdminUserId in RPCs.
  const userSb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${signInData.session!.access_token}` },
    },
  });

  const { data: bookingIdRaw, error: convertErr } = await userSb.rpc(
    "engine_convert_to_booking",
    {
      p_inquiry_id: target.id,
      p_actor_user_id: qaAdminUserId,
      p_inquiry_expected_version: versionBeforeConvert,
      p_override_reason: OVERRIDE_REASON,
    },
  );

  assert(!convertErr, `engine_convert_to_booking: ${convertErr?.message}`);
  testBookingId = String(bookingIdRaw ?? "").trim();
  assert(!!testBookingId, "engine_convert_to_booking returned empty booking_id");
  ok("engine_convert_to_booking", `booking_id=${testBookingId}`);

  // Verify booking row exists.
  const { data: bookingRow } = await sb
    .from("agency_bookings")
    .select("id, source_inquiry_id, tenant_id_snapshot, status")
    .eq("id", testBookingId)
    .single();
  assert(!!bookingRow, "Booking row not found after conversion");
  ok("Booking row", `status=${bookingRow.status}  source_inquiry_id=${bookingRow.source_inquiry_id}`);

  // ── Step 6: Persist commission snapshot (the engine path) ─────────────────

  console.log("\n══ Commission snapshot ══════════════════════════════════════════");

  // This replicates exactly what convertToBooking (TS wrapper) does after the
  // RPC returns. We call it directly here to isolate the commission engine path.
  // Payment method defaults to 'card' (in-platform) → snapshot only, no accrual.
  const paymentMethod: PaymentMethod = "card";

  // 6a. Load context.
  const { data: ctxRaw, error: ctxErr } = await sb.rpc("engine_load_commission_context", {
    p_booking_id: testBookingId,
  });
  assert(!ctxErr, `engine_load_commission_context: ${ctxErr?.message}`);
  assert(!!ctxRaw, "engine_load_commission_context returned null context");

  type CommissionCtx = {
    tenant_id: string;
    workspace_plan: string;
    platform_config: PlatformCommissionConfig;
    tenant_override: WorkspaceCommissionOverride | null;
    offer_id: string;
    currency_code: string;
    offer_line_items: Array<{ units: number; unit_price_cents: number; talent_cost_cents: number }>;
  };
  const ctx = ctxRaw as CommissionCtx;
  ok("engine_load_commission_context", `offer_id=${ctx.offer_id}  plan=${ctx.workspace_plan}`);
  info(
    "line items from context",
    ctx.offer_line_items.map((li) => `${li.units}×$${li.unit_price_cents / 100}`).join(", "),
  );

  // 6b. Resolve commission (pure function, no I/O).
  const snapshot = resolveBookingCommissions({
    tenantId: ctx.tenant_id,
    workspacePlan: normalizePlan(ctx.workspace_plan),
    offerLineItems: ctx.offer_line_items,
    currencyCode: ctx.currency_code,
    paymentMethod,
    platformConfig: ctx.platform_config,
    tenantOverride: ctx.tenant_override ?? null,
  });

  const lanesSum =
    snapshot.platform_fee_cents + snapshot.workspace_fee_cents + snapshot.talent_net_cents;
  assert(lanesSum === snapshot.gross_cents, `lanes_do_not_sum: ${lanesSum} ≠ ${snapshot.gross_cents}`);

  ok(
    "Resolver",
    `gross=$${(snapshot.gross_cents / 100).toFixed(2)}  platform=$${(snapshot.platform_fee_cents / 100).toFixed(2)}` +
      `  workspace=$${(snapshot.workspace_fee_cents / 100).toFixed(2)}` +
      `  talent=$${(snapshot.talent_net_cents / 100).toFixed(2)}` +
      `  from=${snapshot.resolved_from}`,
  );

  // 6c. Persist snapshot.
  const { error: persistErr } = await sb.rpc("engine_persist_booking_commission_snapshot", {
    p_booking_id: testBookingId,
    p_platform_take_bps: snapshot.platform_take_bps,
    p_platform_take_floor_cents: snapshot.platform_take_floor_cents,
    p_gross_cents: snapshot.gross_cents,
    p_platform_fee_cents: snapshot.platform_fee_cents,
    p_workspace_fee_cents: snapshot.workspace_fee_cents,
    p_talent_net_cents: snapshot.talent_net_cents,
    p_currency_code: snapshot.currency_code,
    p_payment_method: snapshot.payment_method,
    p_off_platform_reason: snapshot.off_platform_reason ?? null,
    p_resolved_from: snapshot.resolved_from,
  });
  assert(!persistErr, `engine_persist_booking_commission_snapshot: ${persistErr?.message}`);
  ok("engine_persist_booking_commission_snapshot", "row written");

  // ── Step 7: Assert ────────────────────────────────────────────────────────

  console.log("\n══ Assertions ════════════════════════════════════════════════════");

  const { data: snapRow, error: snapErr } = await sb
    .from("booking_commission_snapshot")
    .select("*")
    .eq("booking_id", testBookingId)
    .single();

  assert(!snapErr, `Query booking_commission_snapshot: ${snapErr?.message}`);
  assert(!!snapRow, "booking_commission_snapshot row missing — engine path did NOT write snapshot");

  ok("booking_commission_snapshot row EXISTS", `booking_id=${testBookingId}`);
  ok("platform_fee_cents", String(snapRow.platform_fee_cents));
  ok("workspace_fee_cents", String(snapRow.workspace_fee_cents));
  ok("talent_net_cents", String(snapRow.talent_net_cents));
  ok("gross_cents", String(snapRow.gross_cents));

  const persistedLanesSum =
    snapRow.platform_fee_cents + snapRow.workspace_fee_cents + snapRow.talent_net_cents;
  assert(
    persistedLanesSum === snapRow.gross_cents,
    `Persisted lanes do not sum to gross: ${persistedLanesSum} ≠ ${snapRow.gross_cents}`,
  );
  ok("lanes_sum_to_gross", `${persistedLanesSum} === ${snapRow.gross_cents}  ✓`);
  ok("resolved_from", snapRow.resolved_from);
  ok("payment_method", snapRow.payment_method);

  console.log("\n══ ALL ASSERTIONS PASSED ═════════════════════════════════════════");
  console.log(
    "  The engine path engine_convert_to_booking → engine_persist_booking_commission_snapshot",
  );
  console.log("  successfully wrote a booking_commission_snapshot row with lanes summing to gross.");

} finally {
  await teardown();
}

console.log("\nDone.\n");
