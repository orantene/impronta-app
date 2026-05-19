/**
 * CHARACTERIZATION TEST — billing/commission-engine.ts
 *
 * Phase 0 money-path safety-net (remediation-plan-2026-05-19 §3 + §5).
 * commission-engine.ts orchestrates the resolver against two SECURITY
 * DEFINER RPCs at booking-conversion time. Its defining contract: a
 * commission failure must NEVER block / revert a booking that already
 * happened — every failure mode is a non-fatal { ok:false, reason }.
 *
 * Unlike the tripwire lanes (inquiry-engine-offers / pitch-engine), the
 * mission for THIS lane is the failure-mapping itself, so we drive a
 * faithful in-process fake SupabaseClient (no DB, no network — `rpc` is a
 * thenable Promise so both `await rpc()` and `rpc().then()` work; `from`
 * is the select→eq→maybeSingle chain the engine uses). normalizePlan is
 * module-private so it is characterized through its only observable
 * effect: the resolved snapshot's platform_take_bps.
 *
 * logServerError only console.error's in non-production (verified in
 * safe-error.ts:41) — failure paths return cleanly; stderr noise is
 * expected and harmless.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here. Suspected
 * bugs are flagged it.skip("CHARACTERIZATION: ... looks wrong — reported").
 *
 * Spec of record: web/docs/commission-model-2026-05-13.md §6/§7.
 * Run: npx tsx --test src/lib/billing/commission-engine.characterization.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistBookingCommissionSnapshot,
  loadBookingCommissionSnapshot,
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
  /** keyed by table name → .maybeSingle() result */
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
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: out.data ?? null, error: out.error ?? null }),
    };
    return chain;
  };

  return {
    supabase: { rpc, from } as unknown as SupabaseClient,
    calls,
  };
}

/** A valid commission context the resolver accepts → canonical 5% split. */
function validCtx(over: Record<string, unknown> = {}) {
  return {
    tenant_id: "ten-1",
    workspace_plan: "agency",
    platform_config: {
      default_take_bps: 500,
      default_take_floor_cents: 0,
      plan_tier_bps: {},
    },
    tenant_override: null,
    offer_id: "off-1",
    currency_code: "MXN",
    offer_line_items: [
      { units: 1, unit_price_cents: 100_000, talent_cost_cents: 80_000 },
    ],
    ...over,
  };
}

const BOOKING = "bk-1";
const rpcNames = (c: Recorder) => c.rpc.map((r) => r.name);

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

  it("RPC returns null data (no error) → detail:'context_null' (the distinct null-context branch)", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: null, error: null } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "context_load_failed", detail: "context_null" });
    assert.deepEqual(rpcNames(calls), ["engine_load_commission_context"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolver_failed — the pure resolver throws on the loaded context
// ─────────────────────────────────────────────────────────────────────────────

describe("persistBookingCommissionSnapshot — resolver_failed", () => {
  it("empty offer → reason:'resolver_failed', detail:'no_line_items'; persist NOT called", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx({ offer_line_items: [] }) } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "resolver_failed", detail: "no_line_items" });
    assert.deepEqual(rpcNames(calls), ["engine_load_commission_context"]);
  });

  it("the CommissionResolutionError code is surfaced verbatim as `detail` (talent_cost_exceeds_price)", async () => {
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

  it("a NON-CommissionResolutionError throw (malformed ctx: offer_line_items=null) → detail:'unknown'", async () => {
    // `!input.offerLineItems.length` → TypeError on null → not a CRE → the
    // `: "unknown"` catch-all branch. Pins that a malformed RPC payload
    // degrades to resolver_failed/unknown, never an unhandled throw.
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx({ offer_line_items: null }) } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(res, { ok: false, reason: "resolver_failed", detail: "unknown" });
  });

  it("CHARACTERIZATION QUIRK: 'skipped_no_offer' is a declared CommissionEngineResult reason that is NEVER produced", async () => {
    // The result union includes `skipped_no_offer`, but an empty offer
    // resolves to resolver_failed/no_line_items (test above). No code path
    // emits skipped_no_offer — pinned so a future no-offer short-circuit
    // (which SHOULD use it) is a deliberate, visible change.
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx({ offer_line_items: [] }) } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, false);
    if (!res.ok) assert.notEqual(res.reason, "skipped_no_offer");
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
      "engine_persist_booking_commission_snapshot",
    ]);
    assert.deepEqual(calls.from, []); // returned before the audit-inquiry lookup
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. success — snapshot returned; persist param contract; audit fire-and-forget
// ─────────────────────────────────────────────────────────────────────────────

describe("persistBookingCommissionSnapshot — success", () => {
  it("returns { ok:true, snapshot } with the resolver's canonical 5% split", async () => {
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.snapshot.gross_cents, 100_000);
      assert.equal(res.snapshot.platform_fee_cents, 5_000);
      assert.equal(res.snapshot.workspace_fee_cents, 20_000);
      assert.equal(res.snapshot.talent_net_cents, 75_000);
      assert.equal(res.snapshot.resolved_from, "platform_default");
      assert.equal(res.snapshot.payment_method, "card"); // default arg
      assert.equal(res.snapshot.off_platform_reason, null);
    }
  });

  it("CONTRACT PIN: persist RPC params mirror the snapshot field-for-field", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    await persistBookingCommissionSnapshot(supabase, BOOKING);
    const persist = calls.rpc.find((r) => r.name === "engine_persist_booking_commission_snapshot");
    assert.ok(persist);
    assert.deepEqual(persist.params, {
      p_booking_id: BOOKING,
      p_platform_take_bps: 500,
      p_platform_take_floor_cents: 0,
      p_gross_cents: 100_000,
      p_platform_fee_cents: 5_000,
      p_workspace_fee_cents: 20_000,
      p_talent_net_cents: 75_000,
      p_currency_code: "MXN",
      p_payment_method: "card",
      p_off_platform_reason: null,
      p_resolved_from: "platform_default",
    });
  });

  it("forwards paymentMethod / offPlatformReason / bookingPlatformTakeBpsOverride into the resolver", async () => {
    const { supabase } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(
      supabase, BOOKING, "cash", "client paid at venue", 100,
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.snapshot.payment_method, "cash");
      assert.equal(res.snapshot.off_platform_reason, "client paid at venue");
      assert.equal(res.snapshot.platform_take_bps, 100); // booking override applied
      assert.equal(res.snapshot.resolved_from, "booking_override");
    }
  });

  it("audit emit fires when source_inquiry_id is present (correct kind + payload)", async () => {
    const { supabase, calls } = makeSupabase({
      rpc: { engine_load_commission_context: { data: validCtx() } },
      from: { agency_bookings: { data: { source_inquiry_id: "inq-9" } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    assert.deepEqual(rpcNames(calls), [
      "engine_load_commission_context",
      "engine_persist_booking_commission_snapshot",
      "inquiry_audit_emit",
    ]);
    const emit = calls.rpc.find((r) => r.name === "inquiry_audit_emit");
    assert.deepEqual(emit?.params, {
      p_inquiry_id: "inq-9",
      p_kind: "commission_split_changed",
      p_payload: {
        booking_id: BOOKING,
        platform_fee_cents: 5_000,
        workspace_fee_cents: 20_000,
        talent_fee_cents: 75_000, // NOTE: payload key is talent_fee_cents (= talent_net)
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
    // The booking + snapshot already persisted; an audit hiccup must never
    // surface to the caller. Pins the spec's core invariant.
    const { supabase } = makeSupabase({
      rpc: {
        engine_load_commission_context: { data: validCtx() },
        inquiry_audit_emit: { error: { message: "audit boom" } },
      },
      from: { agency_bookings: { data: { source_inquiry_id: "inq-9" } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.snapshot.gross_cents, 100_000);
  });

  it("the agency_bookings lookup error path also leaves the booking ok (bk?. optional-chains to null)", async () => {
    // from('agency_bookings') returns an error → `data: bk` is null →
    // `bk?.source_inquiry_id ?? null` → null → audit skipped, still ok:true.
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
          data: validCtx({ workspace_plan, platform_config: planCfg }),
        },
      },
      from: { agency_bookings: { data: { source_inquiry_id: null } } },
    });
    const res = await persistBookingCommissionSnapshot(supabase, BOOKING);
    assert.equal(res.ok, true);
    return res.ok ? res.snapshot.platform_take_bps : -1;
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

  it("unknown / empty / wrong-case strings default to 'free' (switch is case-sensitive)", async () => {
    assert.equal(await resolvedBps("garbage"), 100); // → free
    assert.equal(await resolvedBps(""), 100); // → free
    assert.equal(await resolvedBps("FREE"), 100); // 'FREE' !== 'free' → default → free
    assert.equal(await resolvedBps("Agency"), 100); // case-sensitive → default → free
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. loadBookingCommissionSnapshot — read-through (normal RLS, no RPC)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadBookingCommissionSnapshot", () => {
  it("query error → null (logged, swallowed)", async () => {
    const { supabase, calls } = makeSupabase({
      from: { booking_commission_snapshot: { data: null, error: { message: "read boom" } } },
    });
    assert.equal(await loadBookingCommissionSnapshot(supabase, BOOKING), null);
    assert.deepEqual(calls.from, ["booking_commission_snapshot"]);
  });

  it("no row → null", async () => {
    const { supabase } = makeSupabase({
      from: { booking_commission_snapshot: { data: null, error: null } },
    });
    assert.equal(await loadBookingCommissionSnapshot(supabase, BOOKING), null);
  });

  it("row present → returned verbatim (cast only, no transformation)", async () => {
    const row = {
      booking_id: BOOKING,
      platform_take_bps: 350,
      platform_take_floor_cents: 0,
      gross_cents: 100_000,
      platform_fee_cents: 3_500,
      workspace_fee_cents: 20_000,
      talent_net_cents: 76_500,
      currency_code: "MXN",
      payment_method: "card",
      off_platform_reason: null,
      resolved_from: "tenant_override",
    };
    const { supabase } = makeSupabase({
      from: { booking_commission_snapshot: { data: row } },
    });
    const out = await loadBookingCommissionSnapshot(supabase, BOOKING);
    assert.deepEqual(out, row);
  });
});
