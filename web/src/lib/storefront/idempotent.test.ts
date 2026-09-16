import assert from "node:assert/strict";
import { test } from "node:test";

import { commandIdempotentRunner, type IdempotentRunner } from "./idempotent";
import { memoryIdempotentRunner } from "./__fixtures__/memory-runner";

/**
 * A fake `command_claim` / `command_complete` / `command_heartbeat`, the same
 * shape `lib/commands/run.test.ts` drives the runner with: one row per
 * (tenant, command, key); a succeeded row replays; a failed row is reclaimable;
 * a different fingerprint on the same key is a conflict.
 */
function fakeCommandDb() {
  type Row = { key: string; fp: string; status: string; result: unknown; token: string };
  const rows = new Map<string, Row>();
  let n = 0;
  const admin = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      const a = args ?? {};
      if (name === "command_claim") {
        const id = `${a.p_tenant_id}|${a.p_command}|${a.p_idempotency_key}`;
        const row = rows.get(id);
        if (row && row.fp !== a.p_fingerprint) return { data: { outcome: "conflict" }, error: null };
        if (row && row.status === "succeeded") {
          return { data: { outcome: "replayed", result: row.result, revision: null }, error: null };
        }
        if (row && row.status === "in_flight") return { data: { outcome: "in_flight" }, error: null };
        const token = `t${++n}`;
        rows.set(id, { key: id, fp: String(a.p_fingerprint), status: "in_flight", result: null, token });
        return { data: { outcome: "claimed", claim_id: id, owner_token: token }, error: null };
      }
      if (name === "command_complete") {
        const row = rows.get(String(a.p_claim_id));
        if (!row || row.token !== a.p_owner_token) return { data: { ok: false, reason: "fenced" }, error: null };
        row.status = String(a.p_status);
        row.result = a.p_result ?? null;
        return { data: { ok: true }, error: null };
      }
      if (name === "command_heartbeat") return { data: { ok: true }, error: null };
      throw new Error(`unmodelled rpc ${name}`);
    },
  };
  return { admin, rows };
}

async function contract(name: string, runner: IdempotentRunner) {
  let runs = 0;
  const req = (key: string, args: unknown, ok: boolean) => ({
    command: "storefront.test.write",
    tenantId: "00000000-0000-4000-8000-000000000001",
    actorUserId: null,
    key,
    args,
    run: async () => {
      runs += 1;
      return ok ? { ok: true as const, orderId: `o${runs}` } : { ok: false as const, code: "sold_out" };
    },
  });

  // 1. success, then replay: same result, handler ran once
  const first = await runner(req("k1", { a: 1 }, true));
  assert.equal(first.status, "ok", name);
  const second = await runner(req("k1", { a: 1 }, true));
  assert.equal(second.status, "ok", name);
  assert.equal(runs, 1, `${name}: handler ran twice for one key`);
  if (first.status === "ok" && second.status === "ok") {
    assert.deepEqual(second.result, first.result);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
  }

  // 2. same key, different args → conflict, handler not run
  const other = await runner(req("k1", { a: 2 }, true));
  assert.equal(other.status, "conflict", name);
  assert.equal(runs, 1);

  // 3. a refusal is NOT replayed: the same key can be tried again
  const refused = await runner(req("k2", { a: 1 }, false));
  assert.equal(refused.status, "refused", name);
  if (refused.status === "refused") assert.equal((refused.result as { code: string }).code, "sold_out");
  const retried = await runner(req("k2", { a: 1 }, true));
  assert.equal(retried.status, "ok", `${name}: a refused key must be retryable`);
  assert.equal(runs, 3);
}

test("the command-table runner honours the replay contract", async () => {
  const db = fakeCommandDb();
  await contract("command", commandIdempotentRunner(db.admin));
});

test("the in-memory test runner honours the same contract", async () => {
  await contract("memory", memoryIdempotentRunner().runner);
});
