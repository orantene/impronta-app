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

// ─────────────────────────────────────────────────────────────────────────────
// P3 EXTENSION — failing-replay backoff, backoff escalation, and the SELECT
// guard (attempt cap + next_retry_at filter). The blocks above cover the
// legacy-row guard and the clean re-run. These add:
//   • a REPLAYABLE row whose listener THROWS on re-run → NOT resolved, attempt
//     incremented, next_retry_at pushed out (the replay failed, so we back off).
//   • backoff escalation: a higher attempt_count yields a LATER next_retry_at
//     (exponential, capped) — a poison row can't hot-loop the sweep.
//   • the selection SELECT applies the cap (attempt_count < 5) + the
//     next_retry_at backoff filter, so exhausted/backed-off rows aren't picked.
// ─────────────────────────────────────────────────────────────────────────────

type SelectFilter = { method: string; args: unknown[] };

/**
 * Fake that (a) records every filter applied to the `failed_engine_effects`
 * SELECT so we can assert the cap + backoff window, and (b) THROWS for any OTHER
 * table the replayed listener touches — so a listener that does real DB work
 * (e.g. listener_0 inserting a system message) fails its re-run with a thrown
 * error, exercising the back-off path. Note: a returned `{error}` is not enough
 * — insertSystemMessage swallows query errors; a THROW propagates out of the
 * listener so runEngineListener rejects and the sweep backs the row off.
 */
function makeReplayFailingSupabase(rows: Row[]): {
  client: SupabaseClient;
  updates: RecordedUpdate[];
  selectFilters: SelectFilter[];
} {
  const updates: RecordedUpdate[] = [];
  const selectFilters: SelectFilter[] = [];

  function failedEffectsSelect() {
    const builder: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      selectFilters.push({ method, args });
      return builder;
    };
    builder.select = record("select");
    builder.eq = record("eq");
    builder.lt = record("lt");
    builder.or = record("or");
    builder.limit = async (...args: unknown[]) => {
      selectFilters.push({ method: "limit", args });
      return { data: rows, error: null };
    };
    return builder;
  }

  function failedEffectsUpdate(patch: Record<string, unknown>) {
    return {
      eq: async (_col: string, id: string) => {
        updates.push({ id, patch });
        return { data: null, error: null };
      },
    };
  }

  const client = {
    from(table: string) {
      if (table === "failed_engine_effects") {
        return {
          select: () => failedEffectsSelect(),
          update: (patch: Record<string, unknown>) => failedEffectsUpdate(patch),
        };
      }
      // A replayed listener touched a real table → throw so its re-run rejects.
      throw new Error(`replay-failure (test): listener touched ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, updates, selectFilters };
}

describe("retryFailedEngineEffects — failing replay backs off (never falsely resolves)", () => {
  it("a replayable row whose listener throws on re-run is NOT resolved; attempt++ + backoff", async () => {
    // listener_0 inserts a system message — the failing fake makes that insert
    // error, so the re-run throws and the row is backed off rather than resolved.
    const { client, updates } = makeReplayFailingSupabase([
      {
        id: "row-fail",
        ...baseRow,
        listener_name: "listener_0",
        attempt_count: 1,
        event_type: "inquiry.frozen",
        // listener_0 only does DB work when systemMessage is present.
        event_payload: {
          data: {},
          systemMessage: { threadType: "private", body: "frozen", eventType: "inquiry.frozen" },
        },
        event_actor_user_id: "actor-1",
      },
    ]);

    const res = await retryFailedEngineEffects(client);

    assert.equal(res.retried, 0, "a thrown re-run is not counted as recovered");
    assert.equal(updates.length, 1);
    const patch = updates[0].patch;
    assert.notEqual(patch.resolved, true, "MUST NOT resolve when the replay failed");
    assert.equal(patch.attempt_count, 2, "incremented from 1");
    assert.ok(typeof patch.next_retry_at === "string", "backed off for a later retry");
    assert.ok(typeof patch.retried_at === "string");
  });

  it("backoff escalates with attempt_count (exponential, capped) — a poison row can't hot-loop", async () => {
    const mk = (attempt: number) =>
      makeReplayFailingSupabase([
        {
          id: `row-a${attempt}`,
          ...baseRow,
          listener_name: "listener_0",
          attempt_count: attempt,
          event_type: "inquiry.frozen",
          event_payload: {
            data: {},
            systemMessage: { threadType: "private", body: "frozen", eventType: "inquiry.frozen" },
          },
          event_actor_user_id: "actor-1",
        },
      ]);

    const before = Date.now();
    const low = mk(1);
    await retryFailedEngineEffects(low.client);
    const high = mk(3);
    await retryFailedEngineEffects(high.client);

    const lowAt = new Date(low.updates[0].patch.next_retry_at as string).getTime();
    const highAt = new Date(high.updates[0].patch.next_retry_at as string).getTime();
    assert.ok(lowAt > before, "low-attempt backoff is in the future");
    assert.ok(
      highAt > lowAt,
      "a higher attempt count backs off further out (exponential backoff)",
    );
  });
});

describe("retryFailedEngineEffects — selection guard (cap + backoff window)", () => {
  it("the SELECT bounds the sweep: resolved=false, attempt_count < 5, and next_retry_at due-or-null", async () => {
    const { client, selectFilters } = makeReplayFailingSupabase([]);
    await retryFailedEngineEffects(client);

    const eqs = selectFilters.filter((f) => f.method === "eq");
    const lts = selectFilters.filter((f) => f.method === "lt");
    const ors = selectFilters.filter((f) => f.method === "or");
    const limits = selectFilters.filter((f) => f.method === "limit");

    // Only unresolved rows are swept.
    assert.ok(
      eqs.some((f) => f.args[0] === "resolved" && f.args[1] === false),
      "filters resolved = false",
    );
    // Attempt cap: attempt_count < 5 (rows that exhausted retries stay for the alert).
    assert.ok(
      lts.some((f) => f.args[0] === "attempt_count" && f.args[1] === 5),
      "caps the sweep at attempt_count < 5",
    );
    // Backoff window: next_retry_at is null OR due (<= now).
    assert.ok(
      ors.some((f) => typeof f.args[0] === "string" && /next_retry_at\.is\.null/.test(String(f.args[0])) && /next_retry_at\.lte\./.test(String(f.args[0]))),
      "only picks rows with no backoff or a due backoff",
    );
    // The sweep is batched.
    assert.ok(limits.length === 1 && limits[0].args[0] === 50, "batched at 50 rows");
  });
});
