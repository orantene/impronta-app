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
