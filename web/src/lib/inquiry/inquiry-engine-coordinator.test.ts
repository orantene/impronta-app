/**
 * CHARACTERIZATION TEST — inquiry-engine-coordinator.ts
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 + §5).
 *
 * HONEST GAP NOTE: this file has NO DB-free pure surface a colocated
 * add-test-only lane can characterize. Every exported action's first
 * statement is a DB call (validateActorPermission / preflightInquiryInTenant
 * / supabase.from). The one pure function — mapCoordinatorRpcError — is
 * module-private AND only reached AFTER the RPC, so it is unreachable from
 * a DB-free path and un-importable. Its branching is therefore NOT
 * protected by this net; it needs DB-integration coverage (a different
 * lane). See the it.skip OBSERVATION below.
 *
 * What IS pinned here: the contract that each action's FIRST observable
 * effect is a DB access (no pure pre-flight). A tripwire Proxy proves it.
 * runWithEngineLog-wrapped fns CATCH the tripwire → { success:false,
 * error:<msg> }; the unwrapped one lets it propagate (assert.rejects).
 *
 * Snapshots CURRENT behavior. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/inquiry-engine-coordinator.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  acceptCoordinatorAssignment,
  addSecondaryCoordinator,
  assignCoordinator,
  autoAssignCoordinatorFromSettings,
  declineCoordinatorAssignment,
  promoteToPrimary,
  removeSecondaryCoordinator,
} from "./inquiry-engine-coordinator";

const DB_TRIPWIRE = "DB MUST NOT be touched before the first guard";
const tripwireSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error(DB_TRIPWIRE);
    },
  },
) as unknown as SupabaseClient;

const inqCtx = {
  inquiryId: "inq-1",
  tenantId: "ten-1",
  actorUserId: "actor-1",
  expectedVersion: 1,
};
const coordCtx = {
  inquiryId: "inq-1",
  tenantId: "ten-1",
  userId: "target-1",
  actorUserId: "actor-1",
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — runWithEngineLog-wrapped actions: the wrapper catches the
// tripwire, so a DB-as-first-effect surfaces as { success:false, error:<msg> }.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTRACT PIN: wrapped coordinator actions hit the DB as their first effect", () => {
  it("assignCoordinator → caught tripwire (validateActorPermission is first; no pure pre-flight)", async () => {
    const res = await assignCoordinator(tripwireSupabase, {
      ...inqCtx,
      coordinatorUserId: "coord-1",
    });
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("acceptCoordinatorAssignment → caught tripwire (DB first)", async () => {
    const res = await acceptCoordinatorAssignment(tripwireSupabase, inqCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("declineCoordinatorAssignment → caught tripwire (DB first)", async () => {
    const res = await declineCoordinatorAssignment(tripwireSupabase, inqCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("addSecondaryCoordinator → caught tripwire (preflightInquiryInTenant is first)", async () => {
    const res = await addSecondaryCoordinator(tripwireSupabase, coordCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("removeSecondaryCoordinator → caught tripwire (preflight first)", async () => {
    const res = await removeSecondaryCoordinator(tripwireSupabase, coordCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });

  it("promoteToPrimary → caught tripwire (preflight first)", async () => {
    const res = await promoteToPrimary(tripwireSupabase, coordCtx);
    assert.deepEqual(res, { success: false, error: DB_TRIPWIRE });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PIN — autoAssignCoordinatorFromSettings is NOT wrapped, so the
// tripwire propagates: its first statement is a `supabase.from("inquiries")`
// read with zero pure pre-flight.
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTRACT PIN: autoAssignCoordinatorFromSettings reads the DB immediately (unwrapped → throws)", () => {
  it("throws the tripwire on its first inquiries read", async () => {
    await assert.rejects(
      () =>
        autoAssignCoordinatorFromSettings(
          tripwireSupabase,
          "inq-1",
          "ten-1",
          "actor-1",
          1,
        ),
      new RegExp(DB_TRIPWIRE),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATION — the one pure function in this file is uncoverable here.
// ─────────────────────────────────────────────────────────────────────────────

describe("mapCoordinatorRpcError", () => {
  it.skip("OBSERVATION: pure RPC-error→reason mapper, but module-private (not exported) AND only reached AFTER supabase.rpc(...) — unreachable from any DB-free path and un-importable, so this add-test-only lane cannot characterize it. Its branch table (cannot_remove_primary / already_primary / not_coordinator / target_not_active / inquiry_frozen / not_found / forbidden → reason; else → error) is NOT protected. Refactor owner: export it for a pure unit test, or add DB-integration coverage.", () => {
    // Intentionally empty — records the testability gap explicitly so the
    // safety-net does not silently omit it.
  });
});
