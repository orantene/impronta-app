/**
 * CHARACTERIZATION TEST — inquiry-engine-submit.ts
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 line 51 + §5): the core
 * inquiry/money paths are thinly tested; any Phase-2 refactor touching the
 * inquiry data flow must snapshot CURRENT behavior first and then refactor
 * under green. This file is that snapshot for the SUBMIT engine — the surface
 * every one of the 6 inquiry-creation paths converges on.
 *
 * WHAT THIS PINS
 *
 *   submitInquiry has a genuine DB-free pre-flight surface, unlike its
 *   sibling lifecycle actions. Three observable behaviors happen with NO
 *   Supabase access at all, in this exact order:
 *     1. empty tenant_id            → { success:false, error:"tenant_required" }
 *     2. actor rate-limit exceeded  → { success:false, rateLimited:true, … }
 *     3. tenant rate-limit exceeded → { success:false, rateLimited:true, … }
 *   Only AFTER all three gates pass does the engine touch the DB. A tripwire
 *   Proxy (any property access throws) proves the gates run pre-DB, and the
 *   `runWithEngineLog` wrapper CATCHES the tripwire on the post-gate path →
 *   { success:false, error:<tripwire msg> }, which pins "the very next effect
 *   after the rate gates is a DB read — there is no pure work in between" for
 *   every initiator sub-path (authed / guest-client / guest-admin).
 *
 *   moveToCoordination + setPriority have NO pre-flight: their first
 *   statement is `inquiryInTenant` (a DB read). Pinned via the caught
 *   tripwire — a refactor that adds input validation before the tenant read
 *   MUST update this net.
 *
 * RATE-LIMITER NOTE
 *
 *   `rateLimiter` (./inquiry-rate-limiter) is a module-level in-memory
 *   singleton. These tests import that exact singleton and pre-exhaust a
 *   UNIQUE bucket key per test (no cross-test pollution), then assert
 *   submitInquiry's internal `.check` on the same key returns blocked
 *   WITHOUT reaching the DB. A swap to Redis (the documented future) changes
 *   this contract and must update this net.
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/inquiry-engine-submit.test.ts
 */

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  moveToCoordination,
  setPriority,
  submitInquiry,
  type InquiryInitiatorRole,
  type SubmitInquiryInput,
} from "./inquiry-engine-submit";
import { engineRateKey, rateLimiter } from "./inquiry-rate-limiter";

const DB_TRIPWIRE = "DB MUST NOT be touched before the rate gates pass";
const tripwireSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(DB_TRIPWIRE);
    },
  },
) as unknown as SupabaseClient;

// submitInquiry hard-codes a 1-hour window for every bucket.
const WINDOW_MS = 60 * 60_000;

/**
 * Drive a bucket's count up to `limit` so the NEXT `.check(key, limit, …)`
 * (the one submitInquiry makes internally) is rejected. Mirrors the real
 * limits the engine uses: 5/user, 3/guest, 50/tenant.
 */
async function exhaust(key: string, limit: number): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await rateLimiter.check(key, limit, WINDOW_MS);
  }
}

function baseInput(over: Partial<SubmitInquiryInput> = {}): SubmitInquiryInput {
  return {
    contact_name: "Ada",
    contact_email: "ada@example.com",
    source_channel: "public_directory",
    client_user_id: null,
    talent_profile_ids: [],
    actorUserId: null,
    initiator_role: "client",
    tenant_id: `ten-${randomUUID()}`,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE SURFACE — gate 1: tenant_id. First statement inside runWithEngineLog;
// returns before the rate-limiter is even consulted, before any DB.
// ─────────────────────────────────────────────────────────────────────────────

describe("submitInquiry — gate 1 (tenant_id) is pure and first", () => {
  it('empty tenant_id → { success:false, error:"tenant_required" } with NO DB access', async () => {
    const res = await submitInquiry(
      tripwireSupabase,
      baseInput({ tenant_id: "" }),
    );
    assert.deepEqual(res, { success: false, error: "tenant_required" });
  });

  it("QUIRK: tenant_id is a falsy-check (`!input.tenant_id`), so empty string — not just null/undefined — yields tenant_required, never a thrown error", async () => {
    // tenant_id is typed `string` (required) but the runtime guard is
    // truthiness, so a caller passing "" is handled as a soft failure.
    const res = await submitInquiry(
      tripwireSupabase,
      baseInput({ tenant_id: "", actorUserId: "u-anything" }),
    );
    assert.deepEqual(res, { success: false, error: "tenant_required" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PURE SURFACE — gate 2: per-actor rate limit. authenticated = 5/hr keyed by
// engineRateKey("submitInquiry", userId); guest = 3/hr keyed by
// `submitInquiry:guest:<guest_session_id ?? "anon">`. Returns pre-DB.
// ─────────────────────────────────────────────────────────────────────────────

describe("submitInquiry — gate 2 (per-actor rate limit) is pure and pre-DB", () => {
  it("authenticated actor over 5/hr → { success:false, rateLimited:true, retryAfterMs:number, reason:'rate_limited' } and NO DB", async () => {
    const actorUserId = `u-${randomUUID()}`;
    await exhaust(engineRateKey("submitInquiry", actorUserId), 5);

    const res = await submitInquiry(
      tripwireSupabase,
      baseInput({ actorUserId, initiator_role: "admin" }),
    );
    assert.equal(res.success, false);
    if (!res.success) {
      assert.equal(res.rateLimited, true);
      assert.equal(res.reason, "rate_limited");
      assert.equal(typeof res.retryAfterMs, "number");
      assert.ok((res.retryAfterMs ?? -1) >= 0);
      assert.equal(res.error, undefined);
    }
  });

  it("guest (null actorUserId) over 3/hr, keyed by guest_session_id → rate_limited, NO DB", async () => {
    const gsid = `gs-${randomUUID()}`;
    await exhaust(`submitInquiry:guest:${gsid}`, 3);

    const res = await submitInquiry(
      tripwireSupabase,
      baseInput({ actorUserId: null, guest_session_id: gsid }),
    );
    assert.equal(res.success, false);
    if (!res.success) {
      assert.equal(res.rateLimited, true);
      assert.equal(res.reason, "rate_limited");
    }
  });

  it('QUIRK: a guest with no guest_session_id all share one bucket — key falls back to literal "anon" (3/hr across ALL anonymous submitters globally)', async () => {
    // This is a real cross-visitor coupling: every guest who submits
    // without a session cookie competes for the SAME 3/hr bucket.
    await exhaust("submitInquiry:guest:anon", 3);

    const res = await submitInquiry(
      tripwireSupabase,
      baseInput({ actorUserId: null, guest_session_id: null }),
    );
    assert.equal(res.success, false);
    if (!res.success) {
      assert.equal(res.rateLimited, true);
      assert.equal(res.reason, "rate_limited");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PURE SURFACE — gate 3: per-tenant cap (50/hr across ALL submitters to one
// agency). Checked AFTER the actor gate passes, still pre-DB.
// ─────────────────────────────────────────────────────────────────────────────

describe("submitInquiry — gate 3 (per-tenant 50/hr cap) is pure and pre-DB", () => {
  it("fresh actor but tenant bucket exhausted → rate_limited (proves actor gate passes, then tenant gate blocks, before any DB)", async () => {
    const tenant_id = `ten-${randomUUID()}`;
    const actorUserId = `u-${randomUUID()}`; // fresh — actor gate must pass
    await exhaust(`submitInquiry:tenant:${tenant_id}`, 50);

    const res = await submitInquiry(
      tripwireSupabase,
      baseInput({ tenant_id, actorUserId, initiator_role: "admin" }),
    );
    assert.equal(res.success, false);
    if (!res.success) {
      assert.equal(res.rateLimited, true);
      assert.equal(res.reason, "rate_limited");
      assert.equal(typeof res.retryAfterMs, "number");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — once all three gates pass, the NEXT observable effect is a
// DB read on EVERY initiator sub-path. There is no pure work between the rate
// gates and the first DB access. Proven by the caught tripwire (runWithEngineLog
// turns the thrown Proxy access into { success:false, error:<msg> }).
//
// Each sub-path hits a DIFFERENT first-DB site — the characterization value is
// the documented ordering invariant per path, asserted via identical output.
// ─────────────────────────────────────────────────────────────────────────────

describe("submitInquiry — CONTRACT PIN: first effect after the rate gates is a DB read (no pure pre-flight remains)", () => {
  async function freshGatesThenTripwire(
    over: Partial<SubmitInquiryInput>,
  ) {
    // Unique tenant + actor/guest ids → all three buckets are fresh, all
    // three gates pass, execution falls through to the first DB site.
    return submitInquiry(tripwireSupabase, baseInput(over));
  }

  it("authenticated actor → first DB = validateActorPermission/loadActorProfile → caught tripwire", async () => {
    const res = await freshGatesThenTripwire({
      actorUserId: `u-${randomUUID()}`,
      initiator_role: "client",
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("guest + initiator_role 'client' + ≥1 talent → permission gate skipped; first DB = talent_profiles contact-policy select → caught tripwire", async () => {
    const res = await freshGatesThenTripwire({
      actorUserId: null,
      guest_session_id: `gs-${randomUUID()}`,
      initiator_role: "client",
      talent_profile_ids: ["tp-1", "tp-2"],
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("guest + initiator_role 'admin' (no talents) → permission + contact-policy skipped; first DB = assignCoordinatorFromSettings agencies select → caught tripwire", async () => {
    const res = await freshGatesThenTripwire({
      actorUserId: null,
      guest_session_id: `gs-${randomUUID()}`,
      initiator_role: "admin",
      talent_profile_ids: [],
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("QUIRK: guest + initiator_role 'client' but ZERO talents → contact-policy gate skipped by the `&& talent_profile_ids.length > 0` guard; first DB is the coordinator settings read, not talent_profiles → still caught tripwire", async () => {
    const res = await freshGatesThenTripwire({
      actorUserId: null,
      guest_session_id: `gs-${randomUUID()}`,
      initiator_role: "client",
      talent_profile_ids: [],
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("every InquiryInitiatorRole reaches the DB after the gates (none short-circuits pure)", async () => {
    const roles: InquiryInitiatorRole[] = [
      "client",
      "admin",
      "talent",
      "hub",
      "free_agent",
    ];
    for (const initiator_role of roles) {
      const res = await freshGatesThenTripwire({
        actorUserId: null,
        guest_session_id: `gs-${randomUUID()}`,
        initiator_role,
        talent_profile_ids: [],
      });
      assert.deepEqual(
        res,
        { success: false, error: DB_TRIPWIRE },
        `initiator_role=${initiator_role} should reach the DB (caught tripwire)`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — moveToCoordination + setPriority have NO pre-flight at all.
// First statement is `inquiryInTenant` (a DB read). runWithEngineLog catches
// the tripwire → { success:false, error:<msg> }. A refactor that adds input
// validation before the tenant read MUST update this net.
// ─────────────────────────────────────────────────────────────────────────────

describe("moveToCoordination / setPriority — DB is the first effect (no pure pre-flight)", () => {
  const ctx = {
    inquiryId: "inq-1",
    tenantId: "ten-1",
    actorUserId: "actor-1",
    expectedVersion: 1,
  };

  it("moveToCoordination → caught tripwire (inquiryInTenant first; expectedVersion never inspected pre-DB)", async () => {
    const res = await moveToCoordination(tripwireSupabase, ctx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("setPriority → caught tripwire (inquiryInTenant first)", async () => {
    const res = await setPriority(tripwireSupabase, {
      ...ctx,
      priority: "high",
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it.skip("OBSERVATION: setPriority's `priority` arg is never validated at runtime before the DB write — correctness relies entirely on the TS union ('low'|'normal'|'high'|'urgent') + the DB column constraint. A non-TS caller (JS, RPC, untyped boundary) passing an out-of-range priority would reach the UPDATE. Not a fix target here; flagged for the refactor owner.", () => {});

  it.skip("OBSERVATION: status-transition correctness for these actions lives in canTransition/resolveNextActionBy (./inquiry-lifecycle) and is ALREADY covered by src/lib/inquiry/inquiry-lifecycle.test.ts. inquiry-engine-submit.ts adds no pure transition logic of its own — submit hard-codes status 'submitted' and calls resolveNextActionBy('submitted'); moveToCoordination gates on canTransition(status,'coordination'). Keep that other suite green.", () => {});
});
