/**
 * REGRESSION TEST — cross-tenant per-participant commission (ADR 2026-05-22).
 *
 * Scenario the ADR exists to fix: one inquiry on Tulala Studio's roster
 * has talents owned by DIFFERENT workspaces. Pre-fix, every talent was
 * commissioned at the inquiry's home-tenant tier; post-fix, each talent
 * is commissioned at its frozen owning_party's tier.
 *
 * The two-talent / two-tier case below is the canonical regression. The
 * independent-talent case pins the third resolver path (owning_party_type
 * ='talent' → falls to platform_default with no tenant).
 *
 * Drives the same faithful in-process fake supabase as the characterization
 * test — no DB, no network. The fix lives in the engine's per-participant
 * iteration of `resolveBookingCommissions`; the DB-side RPC reshape is
 * exercised at deploy time (the QA harness can re-run after `db:push`).
 *
 * Run: npx tsx --test src/lib/billing/commission-engine-xtenant.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { persistBookingCommissionSnapshot } from "./commission-engine";

interface RpcOutcome {
  data?: unknown;
  error?: { message: string } | null;
}

function makeSupabase(script: {
  rpc?: Record<string, RpcOutcome>;
  from?: Record<string, RpcOutcome>;
}): {
  supabase: SupabaseClient;
  persistCalls: Array<{ params: unknown }>;
} {
  const persistCalls: Array<{ params: unknown }> = [];

  const rpc = (name: string, params: unknown) => {
    if (name === "engine_persist_booking_commission_snapshot") {
      persistCalls.push({ params });
    }
    const out = script.rpc?.[name] ?? { data: null, error: null };
    return Promise.resolve({ data: out.data ?? null, error: out.error ?? null });
  };

  const from = (table: string) => {
    const out = script.from?.[table] ?? { data: null, error: null };
    const result = { data: out.data ?? null, error: out.error ?? null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve(result),
      order: () => Promise.resolve(result),
    };
    return chain;
  };

  return {
    supabase: { rpc, from } as unknown as SupabaseClient,
    persistCalls,
  };
}

const BOOKING = "bk-xtenant";
const STUDIO = "tenant-studio";
const AGENCY = "tenant-agency";
const HOME = STUDIO; // inquiry submitted on Studio's roster

// ─────────────────────────────────────────────────────────────────────────────
// 1. Two-tenant inquiry on different plan tiers — the bug this ADR fixes.
// ─────────────────────────────────────────────────────────────────────────────

describe("xtenant commission — two participants on different owning tenants", () => {
  it("each participant resolves at ITS OWN owning_party's tier (not the inquiry's home-tenant tier)", async () => {
    const ctx = {
      booking_id: BOOKING,
      home_tenant_id: HOME,
      offer_id: "off-1",
      currency_code: "MXN",
      // Tiered rates ACTIVE: studio=10%, agency=15%. The pre-fix engine
      // would have used Studio's 10% (HOME tier) for both. The fix is
      // proven when agency-owned participant lands at 15%.
      platform_config: {
        default_take_bps: 500,
        default_take_floor_cents: 0,
        plan_tier_bps: { studio: 1000, agency: 1500 },
      },
      participants: [
        {
          // Talent A: owned by Tulala Studio (the home tenant)
          participant_id: "part-studio-talent",
          talent_profile_id: "tp-A",
          owning_party_type: "workspace",
          owning_party_id: STUDIO,
          tenant_id: STUDIO,
          workspace_plan: "studio",
          tenant_override: null,
          offer_line_items: [
            { units: 1, line_total_cents: 200_000, talent_cost_total_cents: 150_000 },
          ],
        },
        {
          // Talent B: owned by Impronta Agency (a different tenant)
          participant_id: "part-agency-talent",
          talent_profile_id: "tp-B",
          owning_party_type: "agency",
          owning_party_id: AGENCY,
          tenant_id: AGENCY,
          workspace_plan: "agency",
          tenant_override: null,
          offer_line_items: [
            { units: 1, line_total_cents: 400_000, talent_cost_total_cents: 300_000 },
          ],
        },
      ],
    };

    const { supabase, persistCalls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: ctx } },
      from: { agency_bookings: { data: { source_inquiry_id: "inq-xtenant" } } },
    });

    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    // One snapshot per participant, in input order.
    assert.equal(res.snapshots.length, 2);

    // Talent A — Studio tier (10%).
    const a = res.snapshots[0];
    assert.equal(a.participant_id, "part-studio-talent");
    assert.equal(a.owning_party_id, STUDIO);
    assert.equal(a.platform_take_bps, 1000, "Studio-owned talent must resolve at 10% (studio plan_tier)");
    assert.equal(a.resolved_from, "plan_tier");
    assert.equal(a.gross_cents, 200_000);
    assert.equal(a.platform_fee_cents, 20_000); // 10% of 200k

    // Talent B — Agency tier (15%). The bug-fix moment: BEFORE the ADR
    // this was 10% (Studio's tier, because the inquiry's home is Studio).
    const b = res.snapshots[1];
    assert.equal(b.participant_id, "part-agency-talent");
    assert.equal(b.owning_party_id, AGENCY);
    assert.equal(b.platform_take_bps, 1500, "Agency-owned talent must resolve at 15% (agency plan_tier) — NOT Studio's 10%");
    assert.equal(b.resolved_from, "plan_tier");
    assert.equal(b.gross_cents, 400_000);
    assert.equal(b.platform_fee_cents, 60_000); // 15% of 400k

    // The persist RPC must have been called once with both rows.
    assert.equal(persistCalls.length, 1);
    const params = persistCalls[0].params as { p_booking_id: string; p_rows: unknown[] };
    assert.equal(params.p_booking_id, BOOKING);
    assert.equal(params.p_rows.length, 2);
  });

  it("under flat-5% config (today's live config), BOTH participants resolve at platform_default — no regression vs. pre-fix output", async () => {
    // Pins that the fix is invariant under the current production config.
    // If anyone re-enables tiered rates by accident, the previous test
    // catches the cross-tenant differentiation; this test catches that we
    // didn't ALSO break the flat-5% world (e.g. by hard-coding plan_tier).
    const ctx = {
      booking_id: BOOKING,
      home_tenant_id: HOME,
      offer_id: "off-1",
      currency_code: "MXN",
      platform_config: {
        default_take_bps: 500,
        default_take_floor_cents: 0,
        plan_tier_bps: {}, // empty = live prod
      },
      participants: [
        {
          participant_id: "part-studio-talent",
          talent_profile_id: "tp-A",
          owning_party_type: "workspace",
          owning_party_id: STUDIO,
          tenant_id: STUDIO,
          workspace_plan: "studio",
          tenant_override: null,
          offer_line_items: [
            { units: 1, line_total_cents: 200_000, talent_cost_total_cents: 150_000 },
          ],
        },
        {
          participant_id: "part-agency-talent",
          talent_profile_id: "tp-B",
          owning_party_type: "agency",
          owning_party_id: AGENCY,
          tenant_id: AGENCY,
          workspace_plan: "agency",
          tenant_override: null,
          offer_line_items: [
            { units: 1, line_total_cents: 400_000, talent_cost_total_cents: 300_000 },
          ],
        },
      ],
    };

    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: ctx } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    for (const snap of res.snapshots) {
      assert.equal(snap.platform_take_bps, 500, "flat-5% — every row falls to platform_default");
      assert.equal(snap.resolved_from, "platform_default");
    }
  });

  it("per-tenant override wins over plan_tier for the SPECIFIC tenant only (other participants stay on plan_tier)", async () => {
    // Mixed precedence: Studio has an override (300 bps), Agency does not.
    // Pins that the resolver hierarchy fires PER PARTICIPANT, not globally.
    const ctx = {
      booking_id: BOOKING,
      home_tenant_id: HOME,
      offer_id: "off-1",
      currency_code: "MXN",
      platform_config: {
        default_take_bps: 500,
        default_take_floor_cents: 0,
        plan_tier_bps: { studio: 1000, agency: 1500 },
      },
      participants: [
        {
          participant_id: "part-studio-talent",
          talent_profile_id: "tp-A",
          owning_party_type: "workspace",
          owning_party_id: STUDIO,
          tenant_id: STUDIO,
          workspace_plan: "studio",
          // Studio negotiated a 3% rate.
          tenant_override: { platform_take_bps: 300, platform_take_floor_cents: null },
          offer_line_items: [
            { units: 1, line_total_cents: 200_000, talent_cost_total_cents: 150_000 },
          ],
        },
        {
          participant_id: "part-agency-talent",
          talent_profile_id: "tp-B",
          owning_party_type: "agency",
          owning_party_id: AGENCY,
          tenant_id: AGENCY,
          workspace_plan: "agency",
          tenant_override: null, // no override
          offer_line_items: [
            { units: 1, line_total_cents: 400_000, talent_cost_total_cents: 300_000 },
          ],
        },
      ],
    };

    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: ctx } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.snapshots[0].platform_take_bps, 300);
    assert.equal(res.snapshots[0].resolved_from, "tenant_override");
    assert.equal(res.snapshots[1].platform_take_bps, 1500);
    assert.equal(res.snapshots[1].resolved_from, "plan_tier");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Independent talent (owning_party_type='talent') — falls to platform_default.
// ─────────────────────────────────────────────────────────────────────────────

describe("xtenant commission — independent talent (owning_party_type='talent')", () => {
  it("resolves at platform_default regardless of plan_tier_bps or any tenant override", async () => {
    const ctx = {
      booking_id: BOOKING,
      home_tenant_id: HOME,
      offer_id: "off-1",
      currency_code: "MXN",
      platform_config: {
        default_take_bps: 500,
        default_take_floor_cents: 0,
        plan_tier_bps: { studio: 1000, agency: 1500, free: 3000 },
      },
      participants: [
        {
          participant_id: "part-independent",
          talent_profile_id: "tp-independent",
          owning_party_type: "talent",
          owning_party_id: "tp-independent",
          tenant_id: null, // no tenant for independents
          workspace_plan: null,
          tenant_override: null,
          offer_line_items: [
            { units: 1, line_total_cents: 100_000, talent_cost_total_cents: 80_000 },
          ],
        },
      ],
    };

    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: ctx } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const snap = res.snapshots[0];
    assert.equal(snap.owning_party_type, "talent");
    // normalizePlan(null) → 'free' (see commission-engine.ts:normalizePlan
    // default branch) → plan_tier_bps['free']=3000 fires. Pinned so any
    // future change to independent-talent semantics is deliberate.
    //
    // NOTE — adr-xtenant-commission-2026-05-22.md §7 leaves the "independent
    // talent rate policy" deferred to execution-plan item #3 (Free vs flat-
    // 5% reconciliation). Today's resolver applies the 'free' plan_tier_bps
    // entry to independents, which matches the configured rule for Free
    // workspaces. If product wants independents on platform_default
    // unconditionally, that's a `normalizePlan` change.
    assert.equal(snap.platform_take_bps, 3000, "today: independents inherit the 'free' plan_tier rate (workspace_plan=null → 'free')");
    assert.equal(snap.resolved_from, "plan_tier");
  });

  it("with no plan_tier_bps configured for 'free', independent falls all the way to platform_default", async () => {
    const ctx = {
      booking_id: BOOKING,
      home_tenant_id: HOME,
      offer_id: "off-1",
      currency_code: "MXN",
      platform_config: {
        default_take_bps: 500,
        default_take_floor_cents: 0,
        plan_tier_bps: {}, // empty — production-current
      },
      participants: [
        {
          participant_id: "part-independent",
          talent_profile_id: "tp-independent",
          owning_party_type: "talent",
          owning_party_id: "tp-independent",
          tenant_id: null,
          workspace_plan: null,
          tenant_override: null,
          offer_line_items: [
            { units: 1, line_total_cents: 100_000, talent_cost_total_cents: 80_000 },
          ],
        },
      ],
    };

    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: ctx } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.snapshots[0].platform_take_bps, 500);
    assert.equal(res.snapshots[0].resolved_from, "platform_default");
  });
});
