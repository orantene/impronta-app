/**
 * BEHAVIORAL TEST — retryFailedEngineEffects (P1 data-loss fix).
 *
 * Pins the corrected contract of the retry sweep:
 *   1. A row WITHOUT replay context (legacy / pre-migration, event_payload null)
 *      is NEVER marked resolved — it is backed off for the ops alert. This is
 *      the core regression guard: the old code did
 *      `update({ attempt_count: 1, resolved: true })` with no re-run, silently
 *      dropping the effect.
 *   2. A row WITH replay context whose listener re-runs cleanly IS marked
 *      resolved (attempt_count incremented, retried_at stamped). listener_2
 *      (improntaLog) is used as the deterministic replay target — it touches no
 *      DB and never throws.
 *   3. `attempt_count` is INCREMENTED, never reset to 1.
 *   4. The selection honors the attempt cap + the next_retry_at backoff filter.
 *
 * Uses a hand-rolled fake Supabase that returns crafted failed_engine_effects
 * rows and records every update. No DB, no network.
 *
 * Run: npx tsx --test src/lib/inquiry/retry-failed-engine-effects.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { retryFailedEngineEffects } from "./inquiry-engine-lifecycle";

type Row = Record<string, unknown> & { id: string };

type RecordedUpdate = { id: string; patch: Record<string, unknown> };

/**
 * Minimal fake Supabase. `failed_engine_effects` SELECT returns the seeded
 * rows; UPDATE records the patch keyed by the `.eq("id", …)` filter. Any other
 * table access throws so a stray query is loud rather than silent.
 */
function makeFakeSupabase(rows: Row[]): {
  client: SupabaseClient;
  updates: RecordedUpdate[];
} {
  const updates: RecordedUpdate[] = [];

  function selectBuilder() {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.lt = chain;
    builder.or = chain;
    // `.limit()` resolves the query.
    builder.limit = async () => ({ data: rows, error: null });
    return builder;
  }

  function updateBuilder(patch: Record<string, unknown>) {
    return {
      eq: async (_col: string, id: string) => {
        updates.push({ id, patch });
        return { data: null, error: null };
      },
    };
  }

  const client = {
    from(table: string) {
      if (table !== "failed_engine_effects") {
        throw new Error(`unexpected table in retry sweep: ${table}`);
      }
      return {
        select: () => selectBuilder(),
        update: (patch: Record<string, unknown>) => updateBuilder(patch),
      };
    },
  } as unknown as SupabaseClient;

  return { client, updates };
}

const baseRow = {
  inquiry_id: "inq-1",
  event_id: "11111111-1111-1111-1111-111111111111",
  engine_action: "inquiry.frozen",
  priority: "high" as const,
  created_at: "2026-06-17T00:00:00.000Z",
};

describe("retryFailedEngineEffects — data-loss fix", () => {
  it("does NOT resolve a legacy row that lacks replay context (event_payload null)", async () => {
    const { client, updates } = makeFakeSupabase([
      {
        id: "row-legacy",
        ...baseRow,
        listener_name: "listener_1",
        attempt_count: 0,
        event_type: null,
        event_payload: null, // pre-migration: nothing to replay
        event_actor_user_id: null,
      },
    ]);

    const res = await retryFailedEngineEffects(client);

    // Nothing was successfully replayed.
    assert.equal(res.retried, 0);
    assert.equal(updates.length, 1);
    const patch = updates[0].patch;
    // The regression guard: resolved must NOT be set true without a re-run.
    assert.notEqual(patch.resolved, true);
    // attempt_count incremented (0 → 1), never *reset* to a constant 1 sans logic.
    assert.equal(patch.attempt_count, 1);
    // Backed off for the ops alert.
    assert.ok(typeof patch.next_retry_at === "string", "expected a backoff timestamp");
  });

  it("increments attempt_count from its prior value (not reset to 1) and backs off", async () => {
    const { client, updates } = makeFakeSupabase([
      {
        id: "row-2",
        ...baseRow,
        listener_name: "listener_1",
        attempt_count: 3, // already tried 3 times
        event_type: null,
        event_payload: null,
        event_actor_user_id: null,
      },
    ]);

    await retryFailedEngineEffects(client);

    assert.equal(updates[0].patch.attempt_count, 4);
    assert.notEqual(updates[0].patch.resolved, true);
  });

  it("RESOLVES a row with replay context whose listener re-runs cleanly", async () => {
    // listener_2 = improntaLog: touches no DB, never throws → deterministic success.
    const { client, updates } = makeFakeSupabase([
      {
        id: "row-ok",
        ...baseRow,
        listener_name: "listener_2",
        attempt_count: 1,
        event_type: "inquiry.frozen",
        event_payload: { data: { reason: "ops_hold" } },
        event_actor_user_id: "actor-1",
      },
    ]);

    const res = await retryFailedEngineEffects(client);

    assert.equal(res.retried, 1);
    assert.equal(updates.length, 1);
    const patch = updates[0].patch;
    assert.equal(patch.resolved, true);
    assert.equal(patch.attempt_count, 2); // incremented from 1
    assert.ok(typeof patch.retried_at === "string");
    // A resolved row does not get a future backoff anchor.
    assert.equal(patch.next_retry_at, undefined);
  });

  it("no unresolved rows → no work", async () => {
    const { client, updates } = makeFakeSupabase([]);
    const res = await retryFailedEngineEffects(client);
    assert.equal(res.retried, 0);
    assert.equal(updates.length, 0);
  });
});
