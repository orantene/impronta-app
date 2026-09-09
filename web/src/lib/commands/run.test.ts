/**
 * run.test.ts — the runner, driven against a fake PostgREST builder.
 *
 * The behaviour under test IS the race, so the fake is not a shortcut around a
 * real database — it is the only way to hold the interleaving still. Every case
 * here is a real sequence an operator produces: a double-tapped button, a
 * retried request after a timeout, a key a client reused across two different
 * baskets, a tab that crashed mid-command.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { makeEnvelope } from "./envelope";
import { runCommand, STALE_CLAIM_MS, type Admin } from "./run";

type Row = {
  id: string;
  tenant_id: string;
  command: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: "in_flight" | "succeeded" | "failed";
  result: unknown;
  error_message: string | null;
  attempt_count: number;
  created_at: string;
};

/**
 * A fake `command_idempotency` table that enforces the ONE property the real
 * schema contributes: the unique index on (tenant, command, key). A fake
 * without it would pass every test here while the mechanism did nothing.
 */
function fakeAdmin(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let nextId = seed.length + 1;

  const builder = () => {
    const filters: Array<[string, unknown]> = [];
    const api: Record<string, unknown> = {};
    let pending: { kind: "insert"; values: Record<string, unknown> } |
      { kind: "update"; patch: Record<string, unknown> } |
      { kind: "select" } = { kind: "select" };

    const match = (row: Row) =>
      filters.every(([column, value]) => (row as unknown as Record<string, unknown>)[column] === value);

    api.insert = (values: Record<string, unknown>) => {
      pending = { kind: "insert", values };
      return api;
    };
    api.update = (patch: Record<string, unknown>) => {
      pending = { kind: "update", patch };
      return api;
    };
    api.select = () => api;
    api.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return api;
    };

    const settle = () => {
      if (pending.kind === "insert") {
        const values = pending.values;
        const clash = rows.some(
          (r) =>
            r.tenant_id === values.tenant_id &&
            r.command === values.command &&
            r.idempotency_key === values.idempotency_key,
        );
        if (clash) return { data: null, error: { code: "23505" } };
        const row: Row = {
          id: `row-${nextId++}`,
          tenant_id: String(values.tenant_id),
          command: String(values.command),
          idempotency_key: String(values.idempotency_key),
          request_fingerprint: String(values.request_fingerprint),
          status: "in_flight",
          result: null,
          error_message: null,
          attempt_count: 1,
          created_at: new Date().toISOString(),
        };
        rows.push(row);
        return { data: { id: row.id }, error: null };
      }
      if (pending.kind === "update") {
        const hit = rows.filter(match);
        for (const row of hit) Object.assign(row, pending.patch);
        return { data: hit[0] ? { id: hit[0].id } : null, error: null };
      }
      const found = rows.find(match) ?? null;
      return { data: found, error: null };
    };

    api.maybeSingle = () => Promise.resolve(settle());
    api.single = () => Promise.resolve(settle());
    api.then = (resolve: (value: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
    return api;
  };

  const admin: Admin = { from: () => builder() };
  return { admin, rows };
}

/**
 * Resolve once the in-flight claim is actually in the table.
 *
 * The concurrency cases all need "the first call has claimed, the second has
 * not yet arrived", and the only honest way to observe that is to watch for
 * the row. Sleeping a tick instead makes the test's outcome depend on how busy
 * the machine is, which is how these two cases passed alone and failed in a
 * lane.
 */
/**
 * A promise plus its resolver, as one value.
 *
 * The `let release: (() => void) | null = null` shape reads fine and does not
 * compile: TypeScript cannot see that the Promise executor already ran, so it
 * narrows `release` to `null` and then to `never` at the call. Handing back
 * both halves together sidesteps the narrowing without a cast.
 */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

async function claimLanded(rows: Row[]): Promise<void> {
  for (let i = 0; i < 1000 && rows.length === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
  assert.ok(rows.length > 0, "the first call never claimed — the test is measuring nothing");
}

const envelope = (over: Partial<Parameters<typeof makeEnvelope>[0]> = {}) =>
  makeEnvelope({
    command: "pos.startCollection",
    tenantId: "tenant-a",
    idempotencyKey: "intent-1",
    ...over,
  });

test("a first call runs the handler and returns its result", async () => {
  const { admin, rows } = fakeAdmin();
  let ran = 0;
  const out = await runCommand(admin, envelope(), { orderId: "o1" }, async () => {
    ran += 1;
    return { paymentId: "p1" };
  });
  assert.deepEqual(out, { status: "ok", result: { paymentId: "p1" } });
  assert.equal(ran, 1);
  assert.equal(rows[0].status, "succeeded");
  assert.deepEqual(rows[0].result, { paymentId: "p1" });
});

test("the same intent replayed returns the stored result without re-running", async () => {
  const { admin } = fakeAdmin();
  let ran = 0;
  const run = () =>
    runCommand(admin, envelope(), { orderId: "o1" }, async () => {
      ran += 1;
      return { paymentId: "p1" };
    });
  await run();
  const second = await run();
  assert.deepEqual(second, { status: "replayed", result: { paymentId: "p1" } });
  assert.equal(ran, 1, "a replay that re-runs the handler is not idempotency");
});

test("a double tap gets in_flight, not a second run", async () => {
  // The case a results-only table cannot cover: by the time a result exists,
  // both copies have already charged the card.
  const { admin, rows } = fakeAdmin();
  let ran = 0;
  const gate = deferred();
  const handler = async () => {
    ran += 1;
    await gate.promise;
    return { paymentId: "p1" };
  };

  const first = runCommand(admin, envelope(), { orderId: "o1" }, handler);
  // Let the first call get past its insert before the second arrives.
  await claimLanded(rows);
  const second = await runCommand(admin, envelope(), { orderId: "o1" }, handler);
  assert.deepEqual(second, { status: "in_flight" });
  assert.equal(ran, 1);

  gate.release();
  await first;
});

test("a key reused with different arguments is refused, not answered", async () => {
  const { admin } = fakeAdmin();
  await runCommand(admin, envelope(), { orderId: "o1" }, async () => ({ ok: 1 }));
  const out = await runCommand(admin, envelope(), { orderId: "o2" }, async () => ({ ok: 2 }));
  assert.deepEqual(out, { status: "conflict", reason: "fingerprint_mismatch" });
});

test("a fingerprint mismatch is reported even while the first call is in flight", async () => {
  // Reporting in_flight here would send the caller into a polling loop waiting
  // for an answer that was never theirs.
  const { admin, rows } = fakeAdmin();
  const gate = deferred();
  const first = runCommand(admin, envelope(), { orderId: "o1" }, async () => {
    await gate.promise;
    return { ok: 1 };
  });
  // Wait for the CLAIM, not for a tick. `runCommand` hashes the arguments
  // before it inserts and a hash is asynchronous, so a fixed `setTimeout(0)`
  // won that race on an idle machine and lost it on a loaded one — this test
  // failed only when run alongside other files.
  await claimLanded(rows);
  assert.equal(rows[0].status, "in_flight");
  const out = await runCommand(admin, envelope(), { orderId: "o2" }, async () => ({ ok: 2 }));
  assert.equal(out.status, "conflict");
  gate.release();
  await first;
});

test("a failed command releases its claim so the retry can run", async () => {
  const { admin, rows } = fakeAdmin();
  const failing = await runCommand(admin, envelope(), { orderId: "o1" }, async () => {
    throw new Error("stripe timed out");
  });
  assert.equal(failing.status, "error");
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].error_message, "stripe timed out");

  const retry = await runCommand(admin, envelope(), { orderId: "o1" }, async () => ({ ok: 1 }));
  assert.deepEqual(retry, { status: "ok", result: { ok: 1 } });
  assert.equal(rows[0].attempt_count, 2);
});

test("an abandoned in-flight claim is taken over after the stale window", async () => {
  // A crash between "handler committed" and "row marked succeeded" leaves a
  // claim over completed work. Holding it forever would make one crashed tab
  // permanently break that button.
  const stale: Row = {
    id: "row-1",
    tenant_id: "tenant-a",
    command: "pos.startCollection",
    idempotency_key: "intent-1",
    request_fingerprint: "",
    status: "in_flight",
    result: null,
    error_message: null,
    attempt_count: 1,
    created_at: new Date(Date.now() - STALE_CLAIM_MS - 1000).toISOString(),
  };
  const { admin, rows } = fakeAdmin([stale]);
  // Match the fingerprint the runner will compute for these arguments.
  const env = envelope();
  const { fingerprintRequest } = await import("./envelope");
  rows[0].request_fingerprint = await fingerprintRequest(env, { orderId: "o1" });

  const out = await runCommand(admin, env, { orderId: "o1" }, async () => ({ ok: 1 }));
  assert.deepEqual(out, { status: "ok", result: { ok: 1 } });
  assert.equal(rows[0].attempt_count, 2);
});

test("a FRESH in-flight claim is never taken over", async () => {
  const fresh: Row = {
    id: "row-1",
    tenant_id: "tenant-a",
    command: "pos.startCollection",
    idempotency_key: "intent-1",
    request_fingerprint: "",
    status: "in_flight",
    result: null,
    error_message: null,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  };
  const { admin, rows } = fakeAdmin([fresh]);
  const env = envelope();
  const { fingerprintRequest } = await import("./envelope");
  rows[0].request_fingerprint = await fingerprintRequest(env, { orderId: "o1" });

  let ran = 0;
  const out = await runCommand(admin, env, { orderId: "o1" }, async () => {
    ran += 1;
    return { ok: 1 };
  });
  assert.deepEqual(out, { status: "in_flight" });
  assert.equal(ran, 0);
});

test("the same key on a different tenant is a different command", async () => {
  const { admin } = fakeAdmin();
  await runCommand(admin, envelope(), { orderId: "o1" }, async () => ({ who: "a" }));
  const other = await runCommand(
    admin,
    envelope({ tenantId: "tenant-b" }),
    { orderId: "o1" },
    async () => ({ who: "b" }),
  );
  assert.deepEqual(other, { status: "ok", result: { who: "b" } });
});

test("the same key on a different command is a different command", async () => {
  const { admin } = fakeAdmin();
  await runCommand(admin, envelope(), { orderId: "o1" }, async () => ({ who: "a" }));
  const other = await runCommand(
    admin,
    envelope({ command: "pos.finalizeOrCancel" }),
    { orderId: "o1" },
    async () => ({ who: "b" }),
  );
  assert.deepEqual(other, { status: "ok", result: { who: "b" } });
});

test("a handler returning undefined replays as null, not undefined", async () => {
  // The replayed and first-run shapes have to agree, or a caller that checks
  // `result === null` behaves differently on a retry.
  const { admin } = fakeAdmin();
  await runCommand(admin, envelope(), {}, async () => undefined);
  const replay = await runCommand(admin, envelope(), {}, async () => undefined);
  assert.deepEqual(replay, { status: "replayed", result: null });
});

test("an infrastructure error on the claim does NOT run the handler", async () => {
  // Running without a claim is running with no idempotency at all, and the
  // caller would have no way to know their retry had become unsafe.
  let ran = 0;
  const admin: Admin = {
    from: () => ({
      insert: () => ({
        select: () => ({
          maybeSingle: async () => ({ data: null, error: { code: "42P01" } }),
        }),
      }),
    }),
  };
  const out = await runCommand(admin, envelope(), {}, async () => {
    ran += 1;
    return { ok: 1 };
  });
  assert.equal(out.status, "error");
  assert.equal(ran, 0);
});
