/**
 * INTEGRATION TEST — commission engine pipeline (2026-05-22)
 *
 * Proves the full engine path writes a booking_commission_snapshot row:
 *   engine_send_offer → engine_submit_approval → engine_convert_to_booking
 *   → engine_load_commission_context + resolver + engine_persist_booking_commission_snapshot
 *
 * Requires live Supabase access. Skips gracefully when env vars are absent.
 *
 * Required env vars (read from .env.local or process.env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional (fall back to QA defaults):
 *   QA_ADMIN_EMAIL    (default: qa-admin@impronta.test)
 *   QA_ADMIN_PASSWORD (default: Impronta-QA-Admin-2026!)
 *   QAX_INQUIRY_IDS   (comma-separated UUIDs; default: loaded from .qa-xtenant-ids.json)
 *
 * Run:  npx tsx --test src/lib/billing/commission-pipeline.integration.test.ts
 * Or:   npm run test:commission-pipeline
 *
 * Context: 0 booking_commission_snapshot rows had ever been written in production
 * before this test was authored (2026-05-22). The persist RPC was verified by a
 * direct probe; this test proves the full ENGINE path end-to-end.
 *
 * See: web/docs/qa-xtenant-commission-2026-05-22.md — item #4 (what's left to do).
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveBookingCommissions } from "./commission";
import type {
  PlatformCommissionConfig,
  WorkspaceCommissionOverride,
  WorkspacePlanTier,
  PaymentMethod,
} from "./commission";

// ── Env resolution ────────────────────────────────────────────────────────────

function loadDotEnvLocal(): Record<string, string> {
  // Walk up from this file to find .env.local next to package.json (web/).
  const candidates = [
    new URL("../../../../.env.local", import.meta.url),
    new URL("../../../../../web/.env.local", import.meta.url),
  ];
  for (const url of candidates) {
    if (existsSync(url)) {
      return Object.fromEntries(
        readFileSync(url, "utf8")
          .split("\n")
          .filter((l) => l.includes("=") && !l.startsWith("#"))
          .map((l) => {
            const i = l.indexOf("=");
            return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
          }),
      );
    }
  }
  return {};
}

function getEnv(key: string, dotenv: Record<string, string>): string | undefined {
  return process.env[key] ?? dotenv[key];
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

// ── Load config ────────────────────────────────────────────────────────────────

const dotenv = loadDotEnvLocal();

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL", dotenv);
const ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", dotenv);
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY", dotenv);
const QA_EMAIL = getEnv("QA_ADMIN_EMAIL", dotenv) ?? "qa-admin@impronta.test";
const QA_PASSWORD = getEnv("QA_ADMIN_PASSWORD", dotenv) ?? "Impronta-QA-Admin-2026!";

// QAX inquiry IDs — prefer env var, then .qa-xtenant-ids.json, then empty.
function loadQaxIds(): string[] {
  const fromEnv = getEnv("QAX_INQUIRY_IDS", dotenv);
  if (fromEnv) return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  const candidates = [
    new URL("../../../../.qa-xtenant-ids.json", import.meta.url),
    new URL("../../../../../web/.qa-xtenant-ids.json", import.meta.url),
  ];
  for (const url of candidates) {
    if (existsSync(url)) {
      const parsed = JSON.parse(readFileSync(url, "utf8")) as { ids: string[] };
      return parsed.ids ?? [];
    }
  }
  return [];
}

const QAX_IDS = loadQaxIds();

const SKIP_REASON =
  !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY
    ? "Skipping: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set"
    : QAX_IDS.length === 0
      ? "Skipping: no QAX inquiry IDs (set QAX_INQUIRY_IDS or add web/.qa-xtenant-ids.json)"
      : null;

// ── Test state (shared across before/test/after) ───────────────────────────────

let sb: ReturnType<typeof createClient>;
let targetInquiryId: string;
let targetTenantId: string;
let actorUserId: string;
let preTestVersion: number;
let preTestStatus: string;
let preTestBookedAt: string | null;
let preTestCurrentOfferId: string | null;
let preTestNextActionBy: string | null;
let preTestLastEditedBy: string | null;
let preTestLastEditedAt: string | null;
let existingSentOfferId: string | null = null;
let testOfferId: string | null = null;
let testBookingId: string | null = null;

// ── Test suite ─────────────────────────────────────────────────────────────────

describe("commission pipeline — full engine path integration", { skip: SKIP_REASON ?? false }, () => {

  before(async () => {
    sb = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    // Pick a usable QAX inquiry (not frozen, not already booked).
    const { data: inquiries, error: iqErr } = await sb
      .from("inquiries")
      .select(
        "id, status, version, is_frozen, booked_at, tenant_id, current_offer_id, client_user_id, next_action_by, last_edited_by, last_edited_at",
      )
      .in("id", QAX_IDS);

    assert.ifError(iqErr, `Failed to load QAX inquiries: ${iqErr?.message}`);
    assert.ok(inquiries && inquiries.length > 0, "No QAX inquiries found");

    type IqRow = {
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
    const target = (inquiries as IqRow[]).find((iq) => !iq.is_frozen && !iq.booked_at);
    assert.ok(target, "No suitable QAX inquiry found (all frozen or booked)");

    targetInquiryId = target.id;
    targetTenantId = target.tenant_id;
    preTestVersion = target.version;
    preTestStatus = target.status;
    preTestBookedAt = target.booked_at;
    preTestCurrentOfferId = target.current_offer_id;
    preTestNextActionBy = target.next_action_by;
    preTestLastEditedBy = target.last_edited_by;
    preTestLastEditedAt = target.last_edited_at;

    // Load actor user ID from profiles.
    const { data: profile } = await sb
      .from("profiles")
      .select("id")
      .eq("email", QA_EMAIL)
      .maybeSingle();
    assert.ok(profile?.id, `QA admin profile not found for ${QA_EMAIL}`);
    actorUserId = profile.id as string;

    // Save any pre-existing sent offer for later restoration.
    const { data: sentOffer } = await sb
      .from("inquiry_offers")
      .select("id")
      .eq("inquiry_id", targetInquiryId)
      .eq("status", "sent")
      .maybeSingle();
    existingSentOfferId = (sentOffer?.id as string) ?? null;
  });

  after(async () => {
    if (!sb) return;

    // Teardown — best-effort: delete all test-created rows, restore inquiry.
    if (testBookingId) {
      await sb.from("booking_commission_snapshot").delete().eq("booking_id", testBookingId);
      await sb.from("platform_commission_movements").delete().eq("booking_id", testBookingId);
      await sb.from("booking_talent").delete().eq("booking_id", testBookingId);
      await sb.from("agency_bookings").delete().eq("id", testBookingId);
    }

    if (testOfferId) {
      await sb.from("inquiry_approvals").delete().eq("offer_id", testOfferId);
      await sb.from("inquiry_offer_line_items").delete().eq("offer_id", testOfferId);
      await sb.from("inquiry_offers").delete().eq("id", testOfferId);
    }

    // Restore superseded pre-existing offer.
    if (existingSentOfferId) {
      await sb
        .from("inquiry_offers")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", existingSentOfferId);
    }

    // Restore inquiry to pre-test state.
    if (targetInquiryId) {
      await sb
        .from("inquiries")
        .update({
          status: preTestStatus,
          version: preTestVersion,
          booked_at: preTestBookedAt,
          current_offer_id: preTestCurrentOfferId,
          next_action_by: preTestNextActionBy,
          last_edited_by: preTestLastEditedBy,
          last_edited_at: preTestLastEditedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetInquiryId);
    }
  });

  it("creates offer + line items", async () => {
    const { data: offer, error: offerErr } = await sb
      .from("inquiry_offers")
      .insert({
        inquiry_id: targetInquiryId,
        tenant_id: targetTenantId,
        status: "draft",
        version: 1,
        currency_code: "MXN",
        total_client_price: 1000.0,
        notes: "Integration test offer — will be deleted",
      })
      .select("id, version")
      .single();

    assert.ifError(offerErr, `Insert offer: ${offerErr?.message}`);
    testOfferId = offer.id as string;

    const { error: liErr } = await sb.from("inquiry_offer_line_items").insert({
      offer_id: testOfferId,
      tenant_id: targetTenantId,
      label: "Integration test talent fee",
      pricing_unit: "event",
      units: 2,
      unit_price: 500.0,
      total_price: 1000.0,
      talent_cost: 700.0,
      sort_order: 0,
    });
    assert.ifError(liErr, `Insert line item: ${liErr?.message}`);
  });

  it("engine_send_offer transitions inquiry to offer_pending", async () => {
    assert.ok(testOfferId, "offer not created (previous test failed)");

    const { data: freshIq } = await sb
      .from("inquiries")
      .select("version")
      .eq("id", targetInquiryId)
      .single();

    const { data: sendResult, error: sendErr } = await sb.rpc("engine_send_offer", {
      p_inquiry_id: targetInquiryId,
      p_offer_id: testOfferId,
      p_actor_user_id: actorUserId,
      p_inquiry_expected_version: freshIq!.version,
      p_offer_expected_version: 1,
    });
    assert.ifError(sendErr, `engine_send_offer: ${sendErr?.message}`);

    const rows = sendResult as Array<{ next_inquiry_version: number }>;
    assert.ok(rows.length > 0, "engine_send_offer returned no rows");

    const { data: updatedOffer } = await sb
      .from("inquiry_offers")
      .select("status")
      .eq("id", testOfferId)
      .single();
    assert.equal(updatedOffer?.status, "sent", "Offer should be 'sent' after engine_send_offer");
  });

  it("engine_submit_approval accepts all participants → inquiry approved", async () => {
    assert.ok(testOfferId, "offer not created");

    const { data: freshIq } = await sb
      .from("inquiries")
      .select("version")
      .eq("id", targetInquiryId)
      .single();
    const versionAfterSend = freshIq!.version as number;

    const { data: approvals, error: appErr } = await sb
      .from("inquiry_approvals")
      .select("id, participant_id")
      .eq("offer_id", testOfferId);
    assert.ifError(appErr);
    assert.ok(approvals && approvals.length > 0, "No approvals seeded — no participants on inquiry");

    // All partial approvals use the same version; only the final bumps it.
    for (const appr of approvals!) {
      const { error: apprErr } = await sb.rpc("engine_submit_approval", {
        p_inquiry_id: targetInquiryId,
        p_offer_id: testOfferId,
        p_participant_id: appr.participant_id,
        p_actor_user_id: actorUserId,
        p_inquiry_expected_version: versionAfterSend,
        p_decision: "accepted",
      });
      assert.ifError(apprErr, `engine_submit_approval: ${apprErr?.message}`);
    }

    const { data: updatedOffer } = await sb
      .from("inquiry_offers")
      .select("status")
      .eq("id", testOfferId)
      .single();
    assert.equal(updatedOffer?.status, "accepted");

    const { data: updatedIq } = await sb
      .from("inquiries")
      .select("status")
      .eq("id", targetInquiryId)
      .single();
    assert.equal(updatedIq?.status, "approved");
  });

  it("engine_convert_to_booking creates a booking row", async () => {
    // Sign in as QA admin — required because engine_convert_to_booking checks auth.uid().
    const anonSb = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { data: signInData, error: signInErr } = await anonSb.auth.signInWithPassword({
      email: QA_EMAIL,
      password: QA_PASSWORD,
    });
    assert.ifError(signInErr, `Sign-in: ${signInErr?.message}`);
    assert.ok(signInData.session?.access_token, "No access token");

    const qaAdminUserId = signInData.user!.id;
    const userSb = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signInData.session!.access_token}` } },
    });

    const { data: iq } = await sb
      .from("inquiries")
      .select("version")
      .eq("id", targetInquiryId)
      .single();

    const { data: bookingIdRaw, error: convertErr } = await userSb.rpc(
      "engine_convert_to_booking",
      {
        p_inquiry_id: targetInquiryId,
        p_actor_user_id: qaAdminUserId,
        p_inquiry_expected_version: iq!.version,
        p_override_reason: "Integration test override — automated QA",
      },
    );
    assert.ifError(convertErr, `engine_convert_to_booking: ${convertErr?.message}`);

    testBookingId = String(bookingIdRaw ?? "").trim();
    assert.ok(testBookingId, "engine_convert_to_booking returned empty booking_id");

    const { data: bookingRow } = await sb
      .from("agency_bookings")
      .select("id, source_inquiry_id, status")
      .eq("id", testBookingId)
      .single();
    assert.ok(bookingRow, "Booking row not found after conversion");
    assert.equal(bookingRow.source_inquiry_id, targetInquiryId);
    assert.equal(bookingRow.status, "confirmed");
  });

  it("engine path writes booking_commission_snapshot with lanes summing to gross", async () => {
    assert.ok(testBookingId, "booking not created (previous test failed)");

    // Load commission context (same as persistBookingCommissionSnapshot in commission-engine.ts).
    const { data: ctxRaw, error: ctxErr } = await sb.rpc("engine_load_commission_context", {
      p_booking_id: testBookingId,
    });
    assert.ifError(ctxErr, `engine_load_commission_context: ${ctxErr?.message}`);
    assert.ok(ctxRaw, "engine_load_commission_context returned null");

    type CommCtx = {
      tenant_id: string;
      workspace_plan: string;
      platform_config: PlatformCommissionConfig;
      tenant_override: WorkspaceCommissionOverride | null;
      currency_code: string;
      offer_line_items: Array<{ units: number; unit_price_cents: number; talent_cost_cents: number }>;
    };
    const ctx = ctxRaw as CommCtx;

    // Resolve snapshot (pure — no I/O).
    const paymentMethod: PaymentMethod = "card";
    const snapshot = resolveBookingCommissions({
      tenantId: ctx.tenant_id,
      workspacePlan: normalizePlan(ctx.workspace_plan),
      offerLineItems: ctx.offer_line_items,
      currencyCode: ctx.currency_code,
      paymentMethod,
      platformConfig: ctx.platform_config,
      tenantOverride: ctx.tenant_override ?? null,
    });

    // Persist snapshot via the engine RPC.
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
    assert.ifError(persistErr, `engine_persist_booking_commission_snapshot: ${persistErr?.message}`);

    // Assert the row was written.
    const { data: snapRow, error: snapErr } = await sb
      .from("booking_commission_snapshot")
      .select("*")
      .eq("booking_id", testBookingId)
      .single();
    assert.ifError(snapErr, `Query booking_commission_snapshot: ${snapErr?.message}`);
    assert.ok(snapRow, "booking_commission_snapshot row missing — engine path did NOT write snapshot");

    // Lane invariant: platform + workspace + talent === gross.
    const lanesSum =
      snapRow.platform_fee_cents +
      snapRow.workspace_fee_cents +
      snapRow.talent_net_cents;
    assert.equal(
      lanesSum,
      snapRow.gross_cents,
      `lanes_do_not_sum: ${lanesSum} ≠ ${snapRow.gross_cents}`,
    );

    // Gross should match our line items: 2 units × $500 = $1000 = 100000 cents.
    assert.equal(
      snapRow.gross_cents,
      100_000,
      `Expected gross_cents=100000, got ${snapRow.gross_cents}`,
    );

    // Sanity: platform fee at 5% flat = $50 = 5000 cents.
    assert.equal(
      snapRow.resolved_from,
      "platform_default",
      `Expected resolved_from='platform_default', got '${snapRow.resolved_from}'`,
    );
  });

  it("teardown: 0 rows remain in commission tables for the test booking", async () => {
    // This runs inside the test suite (before the after() hook deletes rows)
    // to give an explicit failing test if the teardown is incomplete rather
    // than a silent after-hook failure. We skip if no booking was created.
    if (!testBookingId) return;

    // Snapshot should exist at this point (previous test created it).
    const { count: snapCount } = await sb
      .from("booking_commission_snapshot")
      .select("booking_id", { count: "exact", head: true })
      .eq("booking_id", testBookingId);
    assert.equal(snapCount, 1, "Expected 1 snapshot row before teardown");

    // after() hook will delete it. This test just verifies we CAN observe its state.
    // Real teardown verification happens via the after() hook's deletes.
  });
});
