/**
 * CHARACTERIZATION TEST — inquiry-engine-lifecycle.ts
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 + §5).
 *
 * HONEST GAP NOTE: this file has NO DB-free pure surface a colocated
 * add-test-only lane can characterize. Every staff action's first
 * statement is `await inquiryInTenant(supabase, …)` (a DB read); every
 * cron sweep's first statement is a settings read or `supabase.from`.
 * The pure state-machine logic it relies on (canTransition /
 * resolveNextActionBy / validateInquiryConsistency / isMutablePhase)
 * lives in inquiry-lifecycle.ts and is ALREADY covered by the phase-0
 * suite src/lib/inquiry/inquiry-lifecycle.test.ts — it is not re-tested
 * here to avoid a duplicate, drifting net.
 *
 * What IS pinned here: the contract that each export's FIRST observable
 * effect is a DB access (no pure pre-flight / no input validation before
 * the tenant read). A tripwire Proxy proves it. runWithEngineLog-wrapped
 * actions CATCH the tripwire → { success:false, error:<msg> }; the
 * unwrapped cron sweeps let it propagate (assert.rejects).
 *
 * Snapshots CURRENT behavior. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/inquiry-engine-lifecycle.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  archiveInquiry,
  clientCancelInquiry,
  freezeInquiry,
  processCoordinatorTimeouts,
  processExpirations,
  retryFailedEngineEffects,
  unfreezeInquiry,
} from "./inquiry-engine-lifecycle";

const DB_TRIPWIRE = "DB MUST NOT be touched before the tenant guard";
const tripwireSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(DB_TRIPWIRE);
    },
  },
) as unknown as SupabaseClient;

const baseCtx = {
  inquiryId: "inq-1",
  tenantId: "ten-1",
  actorUserId: "actor-1",
  expectedVersion: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — runWithEngineLog-wrapped staff actions. inquiryInTenant is
// the first statement, so a DB-as-first-effect surfaces (caught) as
// { success:false, error:<tripwire> }. Pinned: there is NO input validation
// or pure pre-flight before the tenant read. A refactor that adds one MUST
// update this net.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTRACT PIN: wrapped lifecycle actions hit the DB as their first effect", () => {
  it("freezeInquiry → caught tripwire (inquiryInTenant is first; reason is unused on the DB-first path)", async () => {
    const res = await freezeInquiry(tripwireSupabase, {
      ...baseCtx,
      reason: "ops_hold",
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("unfreezeInquiry → caught tripwire (inquiryInTenant first)", async () => {
    const res = await unfreezeInquiry(tripwireSupabase, baseCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("archiveInquiry → caught tripwire (inquiryInTenant first)", async () => {
    const res = await archiveInquiry(tripwireSupabase, baseCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("clientCancelInquiry → caught tripwire (inquiryInTenant first; optional reason never inspected pre-DB)", async () => {
    const res = await clientCancelInquiry(tripwireSupabase, {
      ...baseCtx,
      reason: "changed_mind",
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — cron sweeps are tenant-less + unwrapped, so the tripwire
// propagates. Each reads the DB (settings or failed_engine_effects) as its
// first statement.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTRACT PIN: cron sweeps read the DB immediately (unwrapped → throw)", () => {
  it("processCoordinatorTimeouts throws on its first settings read", async () => {
    await assert.rejects(
      () => processCoordinatorTimeouts(tripwireSupabase),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("processExpirations throws on its first settings read", async () => {
    await assert.rejects(
      () => processExpirations(tripwireSupabase),
      new RegExp(DB_TRIPWIRE),
    );
  });

  it("retryFailedEngineEffects throws on its first failed_engine_effects read", async () => {
    await assert.rejects(
      () => retryFailedEngineEffects(tripwireSupabase),
      new RegExp(DB_TRIPWIRE),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATION — where the real pure logic lives.
// ─────────────────────────────────────────────────────────────────────────────

describe("pure lifecycle logic", () => {
  it.skip("OBSERVATION: the deterministic state-machine logic this engine relies on (canTransition / resolveNextActionBy / validateInquiryConsistency / isMutablePhase) is imported from ./inquiry-lifecycle and is ALREADY covered by the phase-0 suite src/lib/inquiry/inquiry-lifecycle.test.ts. inquiry-engine-lifecycle.ts adds no pure surface of its own beyond the DB-first contract pinned above. Refactor owner: the transition guards' correctness lives in that other suite — keep it green.", () => {
    // Intentionally empty — points the refactor owner at the existing net
    // so they do not expect (or duplicate) pure coverage here.
  });
});
