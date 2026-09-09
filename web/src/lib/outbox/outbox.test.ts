/**
 * outbox.test.ts — the queue's three promises, held still.
 *
 * The promises are: an enqueue that is retried does not double the effect, a
 * handler that fails comes back later rather than being lost, and a message
 * that can never succeed stops consuming attempts. Each one is a behaviour a
 * real outage produces, and each one is invisible in a happy-path test.
 *
 * The fakes enforce the parts of the schema the behaviour depends on — the
 * partial unique index on `dedupe_key`, and the fact that `claim_outbox_messages`
 * has ALREADY incremented `attempt_count` by the time the drain sees a row.
 * A fake without those two would pass while the mechanism did nothing.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { drainOutbox, type OutboxMessage, type OutboxRegistry } from "./drain";
import { enqueueOutbox, type Admin } from "./enqueue";
import { OUTBOX_MAX_ATTEMPTS, OUTBOX_TOPICS, isOutboxTopic, outboxBackoffMs } from "./topics";

type Stored = {
  id: string;
  tenant_id: string;
  topic: string;
  dedupe_key: string | null;
  status: string;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
};

function fakeQueue(seed: Stored[] = []) {
  const rows: Stored[] = [...seed];
  let nextId = seed.length + 1;

  const builder = () => {
    const filters: Array<[string, unknown]> = [];
    const api: Record<string, unknown> = {};
    let pending:
      | { kind: "insert"; values: Record<string, unknown> }
      | { kind: "update"; patch: Record<string, unknown> }
      | { kind: "select" } = { kind: "select" };

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
        // The partial unique index: only rows WITH a dedupe key collide.
        const key = values.dedupe_key ?? null;
        if (
          key !== null &&
          rows.some(
            (r) => r.tenant_id === values.tenant_id && r.topic === values.topic && r.dedupe_key === key,
          )
        ) {
          return { data: null, error: { code: "23505" } };
        }
        const row: Stored = {
          id: `msg-${nextId++}`,
          tenant_id: String(values.tenant_id),
          topic: String(values.topic),
          dedupe_key: key === null ? null : String(key),
          status: "pending",
          attempt_count: 0,
          last_error: null,
          next_attempt_at: null,
        };
        rows.push(row);
        return { data: { id: row.id }, error: null };
      }
      if (pending.kind === "update") {
        const hit = rows.filter((row) =>
          filters.every(([c, v]) => (row as unknown as Record<string, unknown>)[c] === v),
        );
        for (const row of hit) Object.assign(row, pending.patch);
        return { data: hit[0] ?? null, error: null };
      }
      const found =
        rows.find((row) => filters.every(([c, v]) => (row as unknown as Record<string, unknown>)[c] === v)) ??
        null;
      return { data: found, error: null };
    };

    api.maybeSingle = () => Promise.resolve(settle());
    api.then = (resolve: (value: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
    return api;
  };

  const claimed: OutboxMessage[] = [];
  const admin: Admin = {
    from: () => builder(),
    rpc: (_name: string) => Promise.resolve({ data: claimed, error: null }),
  };
  return { admin, rows, claimed };
}

function message(over: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: "msg-1",
    tenant_id: "tenant-a",
    topic: "exception.raised",
    payload: { kind: "refund_stuck" },
    dedupe_key: null,
    correlation_id: null,
    // The RPC has already incremented this by the time the drain reads it, so
    // a first delivery arrives as 1, not 0.
    attempt_count: 1,
    ...over,
  };
}

test("a topic outside the closed set is not a topic", () => {
  assert.equal(isOutboxTopic("refund.intent_created"), true);
  assert.equal(isOutboxTopic("refund.intent_creatd"), false);
  assert.equal(isOutboxTopic(""), false);
});

test("every declared topic is unique", () => {
  assert.equal(new Set(OUTBOX_TOPICS).size, OUTBOX_TOPICS.length);
});

test("backoff widens but is capped, so an outage that clears is picked up in one poll", () => {
  assert.equal(outboxBackoffMs(1), 30_000);
  assert.equal(outboxBackoffMs(2), 60_000);
  assert.equal(outboxBackoffMs(3), 120_000);
  assert.equal(outboxBackoffMs(OUTBOX_MAX_ATTEMPTS), 60 * 60_000);
  // Uncapped doubling would be days here. The ceiling is the point.
  assert.equal(outboxBackoffMs(40), 60 * 60_000);
  // A nonsense attempt number must not produce a nonsense delay.
  assert.equal(outboxBackoffMs(0), 30_000);
  assert.equal(outboxBackoffMs(-5), 30_000);
});

test("enqueue writes one message", async () => {
  const { admin, rows } = fakeQueue();
  const result = await enqueueOutbox(admin, {
    tenantId: "tenant-a",
    topic: "order.paid",
    dedupeKey: "order:o1:receipt",
  });
  assert.deepEqual(result, { ok: true, id: "msg-1", deduplicated: false });
  assert.equal(rows.length, 1);
});

test("a retried enqueue with the same dedupe key does NOT queue a second effect", async () => {
  const { admin, rows } = fakeQueue();
  const first = await enqueueOutbox(admin, {
    tenantId: "tenant-a",
    topic: "order.paid",
    dedupeKey: "order:o1:receipt",
  });
  const second = await enqueueOutbox(admin, {
    tenantId: "tenant-a",
    topic: "order.paid",
    dedupeKey: "order:o1:receipt",
  });
  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: true, id: null, deduplicated: true });
  assert.equal(rows.length, 1, "the same effect was queued twice — one order, two receipts");
});

test("the dedupe key is scoped to the workspace, not global", async () => {
  const { admin, rows } = fakeQueue();
  await enqueueOutbox(admin, { tenantId: "tenant-a", topic: "order.paid", dedupeKey: "order:1" });
  const other = await enqueueOutbox(admin, {
    tenantId: "tenant-b",
    topic: "order.paid",
    dedupeKey: "order:1",
  });
  assert.equal(other.ok, true);
  assert.equal(rows.length, 2, "workspace B's effect was swallowed by workspace A's key");
});

test("no dedupe key means every enqueue is its own effect", async () => {
  const { admin, rows } = fakeQueue();
  await enqueueOutbox(admin, { tenantId: "tenant-a", topic: "exception.raised" });
  await enqueueOutbox(admin, { tenantId: "tenant-a", topic: "exception.raised" });
  assert.equal(rows.length, 2);
});

test("enqueue refuses rather than throwing when the workspace is missing", async () => {
  const { admin, rows } = fakeQueue();
  const result = await enqueueOutbox(admin, { tenantId: "", topic: "order.paid" });
  assert.deepEqual(result, { ok: false });
  assert.equal(rows.length, 0);
});

test("a delivered message is stamped delivered and stops being pending", async () => {
  const { admin, rows, claimed } = fakeQueue([
    { id: "msg-1", tenant_id: "tenant-a", topic: "exception.raised", dedupe_key: null, status: "pending", attempt_count: 1, last_error: null, next_attempt_at: null },
  ]);
  claimed.push(message());
  const registry: OutboxRegistry = { "exception.raised": async () => ({ ok: true }) };

  const summary = await drainOutbox(admin, registry);
  assert.equal(summary.claimed, 1);
  assert.equal(summary.delivered, 1);
  assert.equal(rows[0].status, "delivered");
});

test("a transient failure comes back later instead of dying", async () => {
  const { admin, rows, claimed } = fakeQueue([
    { id: "msg-1", tenant_id: "tenant-a", topic: "exception.raised", dedupe_key: null, status: "pending", attempt_count: 1, last_error: null, next_attempt_at: null },
  ]);
  claimed.push(message());
  const registry: OutboxRegistry = {
    "exception.raised": async () => ({ ok: false, error: "the printer is off" }),
  };

  const summary = await drainOutbox(admin, registry);
  assert.equal(summary.retrying, 1);
  assert.equal(summary.dead, 0);
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].last_error, "the printer is off");
  assert.ok(rows[0].next_attempt_at, "a retry with no next_attempt_at is a message nobody will serve");
});

test("a permanent refusal skips the remaining attempts", async () => {
  const { admin, rows, claimed } = fakeQueue([
    { id: "msg-1", tenant_id: "tenant-a", topic: "exception.raised", dedupe_key: null, status: "pending", attempt_count: 1, last_error: null, next_attempt_at: null },
  ]);
  claimed.push(message());
  const registry: OutboxRegistry = {
    "exception.raised": async () => ({ ok: false, error: "no such order", permanent: true }),
  };

  const summary = await drainOutbox(admin, registry);
  assert.equal(summary.dead, 1);
  assert.equal(summary.retrying, 0);
  assert.equal(rows[0].status, "dead");
});

test("the attempt cap is a cap: the last attempt dies rather than retrying forever", async () => {
  const { admin, rows, claimed } = fakeQueue([
    { id: "msg-1", tenant_id: "tenant-a", topic: "exception.raised", dedupe_key: null, status: "pending", attempt_count: OUTBOX_MAX_ATTEMPTS, last_error: null, next_attempt_at: null },
  ]);
  claimed.push(message({ attempt_count: OUTBOX_MAX_ATTEMPTS }));
  const registry: OutboxRegistry = {
    "exception.raised": async () => ({ ok: false, error: "still broken" }),
  };

  const summary = await drainOutbox(admin, registry);
  assert.equal(summary.dead, 1);
  assert.equal(rows[0].status, "dead");
});

test("a handler that throws fails that message and does not stop the batch", async () => {
  const { admin, rows, claimed } = fakeQueue([
    { id: "msg-1", tenant_id: "tenant-a", topic: "exception.raised", dedupe_key: null, status: "pending", attempt_count: 1, last_error: null, next_attempt_at: null },
    { id: "msg-2", tenant_id: "tenant-a", topic: "exception.raised", dedupe_key: null, status: "pending", attempt_count: 1, last_error: null, next_attempt_at: null },
  ]);
  claimed.push(message({ id: "msg-1" }), message({ id: "msg-2" }));
  let seen = 0;
  const registry: OutboxRegistry = {
    "exception.raised": async (_admin, m) => {
      seen += 1;
      if (m.id === "msg-1") throw new Error("boom");
      return { ok: true };
    },
  };

  const summary = await drainOutbox(admin, registry);
  assert.equal(seen, 2, "one bad message stalled the whole batch");
  assert.equal(summary.retrying, 1);
  assert.equal(summary.delivered, 1);
  assert.equal(rows[1].status, "delivered");
});

test("an unregistered topic dies immediately and is counted, not left pending", async () => {
  const { admin, rows, claimed } = fakeQueue([
    { id: "msg-1", tenant_id: "tenant-a", topic: "preparation.dispatch", dedupe_key: null, status: "pending", attempt_count: 1, last_error: null, next_attempt_at: null },
  ]);
  claimed.push(message({ topic: "preparation.dispatch" }));

  const summary = await drainOutbox(admin, {});
  assert.equal(summary.unhandled, 1);
  assert.equal(summary.dead, 1);
  assert.equal(rows[0].status, "dead");
  assert.match(String(rows[0].last_error), /no handler/);
});

test("a claim that errors returns an empty summary rather than a half-drain", async () => {
  const admin: Admin = {
    from: () => ({}),
    rpc: () => Promise.resolve({ data: null, error: { message: "connection reset" } }),
  };
  const summary = await drainOutbox(admin, {});
  assert.deepEqual(summary, { claimed: 0, delivered: 0, retrying: 0, dead: 0, unhandled: 0 });
});
