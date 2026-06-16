/**
 * CHARACTERIZATION TEST — inquiry-engine-offers.ts (DB-free branch only)
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 + §5). This file is
 * the money path. Almost every export is DB-bound; the ONE branch that
 * returns before any Supabase / rate-limiter access is submitTalentRate's
 * numeric `invalid_rate` guard. We characterize that guard exhaustively.
 *
 * Tripwire note: these fns are wrapped in runWithEngineLog, which CATCHES
 * a thrown DB-tripwire and converts it to { success:false, error:<msg> }.
 * So here a DB touch shows up as the error STRING, not a thrown failure.
 * That makes the assertion shape itself the proof: an exact-match against
 * { success:false, error:'invalid_rate' } can only hold if no DB / rate-
 * limiter access happened (any access would substitute the tripwire msg).
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/inquiry-engine-offers.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createOffer, submitTalentRate } from "./inquiry-engine-offers";

const DB_TRIPWIRE = "DB MUST NOT be touched on the pure invalid_rate guard";
const tripwireSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(DB_TRIPWIRE);
    },
  },
) as unknown as SupabaseClient;

// Distinct actor per guard-PASSING case so the in-memory rate-limiter
// bucket (keyed by action:actorUserId, limit 20/60s) never accumulates
// across cases — keeps assertions order-independent.
function rateCtx(talentCost: number, actorUserId: string) {
  return {
    inquiryId: "inq-1",
    tenantId: "ten-1",
    offerId: "off-1",
    lineItemId: "li-1",
    actorUserId,
    talentCost,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// submitTalentRate — the numeric guard is the ONLY DB-free exit in the file.
//   if (!Number.isFinite(ctx.talentCost) || ctx.talentCost < 0)
//     return { success: false, error: "invalid_rate" };
// Runs FIRST — before the rate limiter and before inquiryInTenant.
// ─────────────────────────────────────────────────────────────────────────────

describe("submitTalentRate — pure invalid_rate guard (DB-free)", () => {
  for (const bad of [NaN, -1, -0.01, Infinity, -Infinity, Number.NaN] as const) {
    it(`talentCost ${String(bad)} → exactly { success:false, error:'invalid_rate' } with NO DB / rate-limiter access`, async () => {
      const res = await submitTalentRate(tripwireSupabase, rateCtx(bad, "actor-bad"));
      assert.deepEqual(res, { success: false, error: "invalid_rate" });
    });
  }

  it("QUIRK: negative-zero (-0) PASSES the guard — `-0 < 0` is false and Number.isFinite(-0) is true — so it falls through to the first DB touch", async () => {
    const res = await submitTalentRate(tripwireSupabase, rateCtx(-0, "actor-negzero"));
    // Guard passed → rate-limiter ok → inquiryInTenant → tripwire → caught
    // by runWithEngineLog. The tripwire msg (not 'invalid_rate') proves -0
    // is treated as a VALID rate and the guard path itself is DB-free.
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("BOUNDARY: 0 is a VALID rate — guard passes, next effect is a DB read", async () => {
    const res = await submitTalentRate(tripwireSupabase, rateCtx(0, "actor-zero"));
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("BOUNDARY: a positive rate (5) passes the guard, next effect is a DB read", async () => {
    const res = await submitTalentRate(tripwireSupabase, rateCtx(5, "actor-pos"));
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — createOffer (and by extension sendOffer / updateOfferDraft /
// clientRejectOffer / counterOffer) has NO pure pre-flight: the first
// observable effect is the in-memory rate-limiter, then a DB read via
// validateActorPermission. PRICING_UNITS + OfferLineDraft are module-private
// / type-only and only reachable post-DB. Pinned so a refactor that adds a
// pure guard (or reorders the rate-limiter/DB sequence) must update this net.
// These paths need DB-integration coverage — out of this add-test-only lane.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTRACT PIN: createOffer reaches the DB as its first effect after the rate-limiter", () => {
  it("createOffer with a tripwire DB → { success:false, error:<tripwire> } (caught by runWithEngineLog) — proves zero pure pre-flight beyond the rate-limiter", async () => {
    const res = await createOffer(tripwireSupabase, {
      inquiryId: "inq-1",
      tenantId: "ten-1",
      actorUserId: "actor-createoffer",
      expectedVersion: 1,
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A1 + A1b — submitTalentRate (recording fake DB).
//
// The pure-guard tests above prove the early exits; these drive the function
// through to its writes with a small recording Supabase fake to assert WHAT it
// writes:
//   A1  — the line-item UPDATE sets talent_cost ONLY (the talent's cost), never
//         unit_price / total_price (the coordinator-set CLIENT price → margin).
//   A1b — the talent_rate chat-card is inserted into the PRIVATE (staff) thread,
//         not the group thread the client + peer talents can read.
//
// The actor is super_admin (isStaff=true), which skips the talent-self lookup.
// ─────────────────────────────────────────────────────────────────────────────

type RecordedInsert = { table: string; values: Record<string, unknown> };
type RecordedUpdate = { table: string; values: Record<string, unknown> };

/**
 * Minimal chainable Supabase fake. Reads (.maybeSingle/.single) resolve to the
 * canned row for the table; writes (.insert/.update) are recorded and resolve
 * benignly. Any other awaited terminal resolves to { data: [], error: null } so
 * the engine's post-write event listeners never throw.
 */
function makeRecordingSupabase(reads: Record<string, unknown>) {
  const inserts: RecordedInsert[] = [];
  const updates: RecordedUpdate[] = [];

  function makeBuilder(table: string) {
    let pendingUpdate: Record<string, unknown> | null = null;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    const result = { data: reads[table] ?? null, error: null };

    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.not = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.returns = chain;
    builder.delete = chain;
    builder.maybeSingle = async () => result;
    builder.single = async () => result;
    builder.insert = (values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return { ...builder, then: undefined };
    };
    builder.update = (values: Record<string, unknown>) => {
      pendingUpdate = values;
      updates.push({ table, values });
      return builder;
    };
    // Awaiting the builder directly (e.g. an unterminated update) resolves OK.
    builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: pendingUpdate ?? reads[table] ?? [], error: null });
    return builder;
  }

  const supabase = {
    from: (table: string) => makeBuilder(table),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as SupabaseClient;

  return { supabase, inserts, updates };
}

function staffReads(line: { units: number | null; talent_profile_id: string | null }) {
  return {
    inquiries: { id: "inq-1", tenant_id: "ten-1" },
    profiles: { id: "actor-staff", app_role: "super_admin" },
    inquiry_offer_line_items: { id: "li-1", offer_id: "off-1", talent_profile_id: line.talent_profile_id, units: line.units },
    inquiry_offers: { id: "off-1", status: "draft", inquiry_id: "inq-1", currency_code: "USD" },
    talent_profiles: { display_name: "Test Talent", full_name: "Test Talent" },
  };
}

describe("A1 — submitTalentRate updates talent_cost ONLY (never unit_price/total_price)", () => {
  it("the line-item UPDATE carries talent_cost and NOT unit_price / total_price", async () => {
    const { supabase, updates } = makeRecordingSupabase(
      staffReads({ units: 3, talent_profile_id: "tp-1" }),
    );
    const res = await submitTalentRate(supabase, {
      inquiryId: "inq-1",
      tenantId: "ten-1",
      offerId: "off-1",
      lineItemId: "li-1",
      actorUserId: "actor-staff",
      talentCost: 200,
    });
    assert.equal(res.success, true);

    const liUpdate = updates.find((u) => u.table === "inquiry_offer_line_items");
    assert.ok(liUpdate, "expected an inquiry_offer_line_items UPDATE");
    assert.equal(liUpdate.values.talent_cost, 200);
    assert.equal(
      Object.prototype.hasOwnProperty.call(liUpdate.values, "unit_price"),
      false,
      "unit_price (CLIENT price) must NOT be touched",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(liUpdate.values, "total_price"),
      false,
      "total_price (CLIENT price) must NOT be touched",
    );
    assert.deepEqual(liUpdate.values, { talent_cost: 200 });
  });
});

describe("A1b — submitTalentRate routes the rate card to the PRIVATE thread", () => {
  it("the talent_rate chat-card insert uses thread_type 'private', not 'group'", async () => {
    const { supabase, inserts } = makeRecordingSupabase(
      staffReads({ units: 1, talent_profile_id: "tp-1" }),
    );
    const res = await submitTalentRate(supabase, {
      inquiryId: "inq-1",
      tenantId: "ten-1",
      offerId: "off-1",
      lineItemId: "li-1",
      actorUserId: "actor-staff",
      talentCost: 150,
    });
    assert.equal(res.success, true);

    const rateCard = inserts.find(
      (i) => i.table === "inquiry_messages" && i.values.message_kind === "talent_rate",
    );
    assert.ok(rateCard, "expected a talent_rate chat-card insert");
    assert.equal(rateCard.values.thread_type, "private");
    assert.notEqual(rateCard.values.thread_type, "group");
  });
});
