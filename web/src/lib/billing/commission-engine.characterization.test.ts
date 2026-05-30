/**
 * CHARACTERIZATION TEST — billing/commission-engine.ts
 *
 * Phase 0 money-path safety-net (remediation-plan-2026-05-19 §3 + §5).
 * commission-engine.ts orchestrates the resolver against two SECURITY
 * DEFINER RPCs at booking-conversion time. Its defining contract: a
 * commission failure must NEVER block / revert a booking that already
 * happened — every failure mode is a non-fatal { ok:false, reason }.
 *
 * Updated 2026-05-22 for per-participant grain (ADR adr-xtenant-commission-2026-05-22):
 *   - `engine_load_commission_context` returns a participants array.
 *   - `engine_persist_booking_commission_snapshot` takes `(p_booking_id, p_rows)`.
 *   - The engine returns `{ ok:true, snapshots: ParticipantSnapshot[] }`.
 *
 * Unlike the tripwire lanes (inquiry-engine-offers / pitch-engine), the
 * mission for THIS lane is the failure-mapping itself, so we drive a
 * faithful in-process fake SupabaseClient (no DB, no network — `rpc` is a
 * thenable Promise so both `await rpc()` and `rpc().then()` work; `from`
 * is the select→eq→{maybeSingle|order} chain the engine uses).
 * normalizePlan is module-private so it is characterized through its only
 * observable effect: the resolved snapshot's platform_take_bps.
 *
 * logServerError only console.error's in non-production (verified in
 * safe-error.ts:41) — failure paths return cleanly; stderr noise is
 * expected and harmless.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here. Suspected
 * bugs are flagged it.skip("CHARACTERIZATION: ... looks wrong — reported").
 *
 * Spec of record: web/docs/commission-model-2026-05-13.md §6/§7
 *                 web/docs/adr-xtenant-commission-2026-05-22.md
 * Run: npx tsx --test src/lib/billing/commission-engine.characterization.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistBookingCommissionSnapshot,
  loadBookingCommissionSnapshot,
  loadBookingCommissionSnapshots,
} from "./commission-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Faithful in-process fake — mirrors only the call shapes the engine uses.
// ─────────────────────────────────────────────────────────────────────────────

interface RpcOutcome {
  data?: unknown;
  error?: { message: string } | null;
}

interface SupaScript {
  /** keyed by rpc name → { data, error } */
  rpc?: Record<string, RpcOutcome>;
  /** keyed by table name → terminal result */
  from?: Record<string, RpcOutcome>;
}

interface Recorder {
  rpc: Array<{ name: string; params: unknown }>;
  from: string[];
}

function makeSupabase(
  script: SupaScript,
): { supabase: SupabaseClient; calls: Recorder } {
  const calls: Recorder = { rpc: [], from: [] };

  const rpc = (name: string, params: unknown) => {
    calls.rpc.push({ name, params });
    const out = script.rpc?.[name] ?? { data: null, error: null };
    // Promise → awaitable AND thenable (the audit emit chains `.then`).
    return Promise.resolve({ data: out.data ?? null, error: out.error ?? null });
  };

  const from = (table: string) => {
    calls.from.push(table);
    const out = script.from?.[table] ?? { data: null, error: null };
    const result = { data: out.data ?? null, error: out.error ?? null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      // Two terminals: maybeSingle (used by agency_bookings lookup) and
      // order (used by loadBookingCommissionSnapshots).
      maybeSingle: () => Promise.resolve(result),
      order: () => Promise.resolve(result),
    };
    return chain;
  };

  return {
    supabase: { rpc, from } as unknown as SupabaseClient,
    calls,
  };
}

const BOOKING = "bk-1";
const PARTICIPANT = "part-1";
const TENANT = "ten-1";
const rpcNames = (c: Recorder) => c.rpc.map((r) => r.name);

/** A valid per-participant commission context the resolver accepts →
 *  canonical 5% split when platform_default fires. */
function validCtx(
  participantOverrides: Record<string, unknown> = {},
  ctxOverrides: Record<string, unknown> = {},
) {
  return {
    booking_id: BOOKING,
    home_tenant_id: TENANT,
    offer_id: "off-1",
    currency_code: "MXN",
    platform_config: {
      default_take_bps: 500,
      default_take_floor_cents: 0,
      plan_tier_bps: {},
    },
    participants: [
      {
        participant_id: PARTICIPANT,
        talent_profile_id: "tp-1",
        owning_party_type: "workspace",
        owning_party_id: TENANT,
        tenant_id: TENANT,
        workspace_plan: "agency",
        tenant_override: null,
        offer_line_items: [
          { units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 },
        ],
        ...participantOverrides,
      },
    ],
    ...ctxOverrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. context_load_failed — the first RPC
// ─────────────────────────────────────────────────────────────────────────────

describe("persistBookingCommissionSnapshot — context_load_failed", () => {
  it("RPC returns an error → { ok:false, reason:'context_load_failed', detail:<message> }; no persist attempted", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: null, error: { message: "ctx boom" } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "context_load_failed", detail: "ctx boom" });
    assert.deepEqual(rpcNames(calls), ["engine_load_commission_context"]); // stopped here
  });

  it("RPC returns null data (no error) → detail:'context_null'", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: null, error: null } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "context_load_failed", detail: "context_null" });
    assert.deepEqual(rpcNames(calls), ["engine_load_commission_context"]);
  });

  it("RPC returns empty participants array → detail:'no_participants'", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx({}, { participants: [] }) } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "context_load_failed", detail: "no_participants" });
    assert.deepEqual(rpcNames(calls), ["engine_load_commission_context"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolver_failed — the pure resolver throws on the loaded context
// ─────────────────────────────────────────────────────────────────────────────

describe("persistBookingCommissionSnapshot — resolver_failed", () => {
  it("participant with empty line items → reason:'resolver_failed', detail:'no_line_items'; persist NOT called", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx({ offer_line_items: [] }) } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "resolver_failed", detail: "no_line_items" });
    assert.deepEqual(rpcNames(calls), [
      "engine_load_commission_context",
      "engine_platform_commission_split",
      "engine_workspace_base_fee_inputs",
    ]);
  });

  it("CommissionResolutionError code is surfaced verbatim as `detail` (talent_cost_exceeds_price)", async () => {
    const { supabase } = makeSupabase({
      rpc: {
        engine_load_commission_context: {
          data: validCtx({
            offer_line_items: [{ units: 1, unit_price_cents: 100, talent_cost_cents: 200 }],
          }),
        },
      },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "resolver_failed", detail: "talent_cost_exceeds_price" });
  });

  it("non-CommissionResolutionError throw (malformed ctx: offer_line_items=null) → detail:'unknown'", async () => {
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx({ offer_line_items: null }) } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "resolver_failed", detail: "unknown" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. persist_failed — context + resolve OK, the persist RPC errors
// ─────────────────────────────────────────────────────────────────────────────

describe("persistBookingCommissionSnapshot — persist_failed", () => {
  it("persist RPC error → { ok:false, reason:'persist_failed', detail:<message> }; audit NOT reached", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: {
        engine_load_commission_context: { data: validCtx() },
        engine_persist_booking_commission_snapshot: { error: { message: "persist boom" } },
      },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "persist_failed", detail: "persist boom" });
    assert.deepEqual(rpcNames(calls), [
      "engine_load_commission_context",
      "engine_platform_commission_split",
      "engine_workspace_base_fee_inputs",
      "engine_persist_booking_commission_snapshot",
    ]);
    assert.deepEqual(calls.from, []); // returned before the audit-inquiry lookup
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. success — snapshot array; persist param contract; audit fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────

describe("persistBookingCommissionSnapshot — success", () => {
  it("returns { ok:true, snapshots:[…] } with the resolver's canonical 5% split", async () => {
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.snapshots.length, 1);
      const snap = res.snapshots[0];
      assert.equal(snap.participant_id, PARTICIPANT);
      assert.equal(snap.owning_party_type, "workspace");
      assert.equal(snap.owning_party_id, TENANT);
      assert.equal(snap.gross_cents, 100_000);
      assert.equal(snap.platform_fee_cents, 5_000);
      assert.equal(snap.workspace_fee_cents, 17_500); // margin 20000 − seller deduction 2500
      assert.equal(snap.talent_net_cents, 80_000);    // full quote — protected
      assert.equal(snap.client_surcharge_cents, 2_500);
      assert.equal(snap.gross_charged_cents, 102_500);
      assert.equal(snap.seller_of_record, "workspace");
      assert.equal(snap.resolved_from, "platform_default");
      assert.equal(snap.payment_method, "card"); // default arg
      assert.equal(snap.off_platform_reason, null);
    }
  });

  it("CONTRACT PIN: persist RPC params are (p_booking_id, p_rows[]) with one row per participant", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    await persistBookingCommissionSnapshot(supabase, BOOKING);
    const persist = calls.rpc.find((r) => r.name === "engine_persist_booking_commission_snapshot");
    assert.ok(persist);
    assert.deepEqual(persist.params, {
      p_booking_id: BOOKING,
      p_rows: [
        {
          participant_id: PARTICIPANT,
          owning_party_type: "workspace",
          owning_party_id: TENANT,
          platform_take_bps: 500,
          platform_take_floor_cents: 0,
          gross_cents: 100_000,
          platform_fee_cents: 5_000,
          workspace_fee_cents: 17_500,
          talent_net_cents: 80_000,
          client_surcharge_cents: 2_500,
          seller_deduction_cents: 2_500,
          gross_charged_cents: 102_500,
          seller_shortfall_cents: 0,
          currency_code: "MXN",
          payment_method: "card",
          off_platform_reason: null,
          resolved_from: "platform_default",
        },
      ],
    });
  });

  it("forwards paymentMethod / offPlatformReason / bookingPlatformTakeBpsOverride into the resolver (applied to every row)", async () => {
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(
      supabase, BOOKING, "cash", "client paid at venue", 100,
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      const snap = res.snapshots[0];
      assert.equal(snap.payment_method, "cash");
      assert.equal(snap.off_platform_reason, "client paid at venue");
      assert.equal(snap.platform_take_bps, 100); // booking override applied
      assert.equal(snap.resolved_from, "booking_override");
    }
  });

  it("audit emit fires when source_inquiry_id is present (correct kind + aggregated payload)", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: "inq-9" } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    assert.deepEqual(rpcNames(calls), [
      "engine_load_commission_context",
      "engine_platform_commission_split",
      "engine_workspace_base_fee_inputs",
      "engine_persist_booking_commission_snapshot",
      "inquiry_audit_emit",
    ]);
    const emit = calls.rpc.find((r) => r.name === "inquiry_audit_emit");
    assert.deepEqual(emit?.params, {
      p_inquiry_id: "inq-9",
      p_kind: "commission_split_changed",
      p_payload: {
        booking_id: BOOKING,
        participant_count: 1,
        platform_fee_cents: 5_000,
        workspace_fee_cents: 17_500,
        talent_fee_cents: 80_000, // NOTE: payload key is talent_fee_cents (= talent_net)
      },
    });
  });

  it("audit emit SKIPPED when source_inquiry_id is null — still ok:true, no inquiry_audit_emit rpc", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    assert.equal(calls.rpc.some((r) => r.name === "inquiry_audit_emit"), false);
    assert.deepEqual(calls.from, ["agency_bookings"]);
  });

  it("MONEY-PATH GUARANTEE: a FAILING audit emit does NOT fail the booking (fire-and-forget)", async () => {
    const { supabase } = makeSupabase({
      rpc: {
        engine_load_commission_context: { data: validCtx() },
        inquiry_audit_emit: { error: { message: "audit boom" } },
      },
      from: { agency_bookings: { data: { source_inquiry_id: "inq-9" } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.snapshots[0].gross_cents, 100_000);
  });

  it("the agency_bookings lookup error path also leaves the booking ok (bk?. optional-chains to null)", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: null, error: { message: "bk lookup boom" } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    assert.equal(calls.rpc.some((r) => r.name === "inquiry_audit_emit"), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. normalizePlan — module-private; characterized via the resolved snapshot
//    plan_tier_bps distinguishes plans → resolved bps reveals the mapping.
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizePlan (observed through resolved platform_take_bps)", () => {
  const planCfg = {
    default_take_bps: 999,
    default_take_floor_cents: 0,
    plan_tier_bps: { free: 100, studio: 200, agency: 300, network: 400 },
  };

  async function resolvedBps(workspace_plan: unknown): Promise<number> {
    const { supabase } = makeSupabase({
      rpc: {
        engine_load_commission_context: {
          data: validCtx({ workspace_plan }, { platform_config: planCfg }),
        },
      },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    return res.ok ? res.snapshots[0].platform_take_bps : -1;
  }

  it("the 4 canonical plans pass through unchanged", async () => {
    assert.equal(await resolvedBps("free"), 100);
    assert.equal(await resolvedBps("studio"), 200);
    assert.equal(await resolvedBps("agency"), 300);
    assert.equal(await resolvedBps("network"), 400);
  });

  it("both 'hub-network' and 'hub_network' alias to 'network'", async () => {
    assert.equal(await resolvedBps("hub-network"), 400);
    assert.equal(await resolvedBps("hub_network"), 400);
  });

  it("unknown / empty / wrong-case / null strings default to 'free' (switch is case-sensitive)", async () => {
    assert.equal(await resolvedBps("garbage"), 100); // → free
    assert.equal(await resolvedBps(""), 100); // → free
    assert.equal(await resolvedBps("FREE"), 100); // 'FREE' !== 'free' → default → free
    assert.equal(await resolvedBps("Agency"), 100); // case-sensitive → default → free
    assert.equal(await resolvedBps(null), 100); // null (independent talents) → free → platform_default
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. loadBookingCommissionSnapshot[s] — read-through (normal RLS, no RPC)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadBookingCommissionSnapshots", () => {
  it("query error → [] (logged, swallowed)", async () => {
    const { supabase, calls } = makeSupabase({
      from: { booking_commission_snapshot: { data: null, error: { message: "read boom" } } },
    });
    assert.deepEqual(await loadBookingCommissionSnapshots(supabase, BOOKING), []);
    assert.deepEqual(calls.from, ["booking_commission_snapshot"]);
  });

  it("no rows → []", async () => {
    const { supabase } = makeSupabase({
      from: { booking_commission_snapshot: { data: null, error: null } },
    });
    assert.deepEqual(await loadBookingCommissionSnapshots(supabase, BOOKING), []);
  });

  it("rows present → returned verbatim (cast only)", async () => {
    const rows = [
      {
        booking_id: BOOKING,
        participant_id: PARTICIPANT,
        owning_party_type: "workspace" as const,
        owning_party_id: TENANT,
        platform_take_bps: 350,
        platform_take_floor_cents: 0,
        gross_cents: 100_000,
        platform_fee_cents: 3_500,
        workspace_fee_cents: 20_000,
        talent_net_cents: 76_500,
        currency_code: "MXN",
        payment_method: "card" as const,
        off_platform_reason: null,
        resolved_from: "tenant_override" as const,
        created_at: "2026-05-22T00:00:00Z",
      },
    ];
    const { supabase } = makeSupabase({
      from: { booking_commission_snapshot: { data: rows } },
    });
    const out = await loadBookingCommissionSnapshots(supabase, BOOKING);
    assert.deepEqual(out, rows);
  });
});

describe("loadBookingCommissionSnapshot (single-row legacy helper)", () => {
  it("returns the first row when rows exist", async () => {
    const rows = [
      { booking_id: BOOKING, participant_id: "p-a", platform_fee_cents: 1 },
      { booking_id: BOOKING, participant_id: "p-b", platform_fee_cents: 2 },
    ];
    const { supabase } = makeSupabase({
      from: { booking_commission_snapshot: { data: rows } },
    });
    const out = await loadBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(out?.participant_id, "p-a");
  });

  it("returns null when no rows", async () => {
    const { supabase } = makeSupabase({
      from: { booking_commission_snapshot: { data: [], error: null } },
    });
    assert.equal(await loadBookingCommissionSnapshot(supabase, BOOKING), null);
  });
});
