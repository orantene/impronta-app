/**
 * Offline cash replay: reserve (RPC) → the live cash tender → stamp applied.
 *
 * Before 20261231237000 the sync action called `pos_outbox_apply` and
 * stopped: the RPC reserved for 120 s and nothing ever wrote the money row,
 * so an offline cash sale was a claim that lapsed (audit A4). These tests
 * pin the walk: the tender runs under the outbox's own operation key, and the
 * stamp is asked for only after it succeeds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCashCollectCommand, replayCashOutboxItem } from "./outbox-replay";
import type { StartCollectionResult } from "./collection";

const ORDER = "11111111-2222-4333-8444-555555555555";

function admin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => {
      throw new Error("no table reads in the replay walk");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("parseCashCollectCommand accepts only the RPC shape", () => {
  assert.deepEqual(
    parseCashCollectCommand({ kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 }),
    { kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 },
  );
  // The pre-fix client shape is refused before the socket, not guessed at.
  assert.equal(parseCashCollectCommand({ kind: "cash_collect", orderId: ORDER, amountCents: 1400 }), null);
  assert.equal(parseCashCollectCommand({ kind: "card_collect", provider: "stripe", order_id: ORDER, amount_cents: 1 }), null);
  assert.equal(parseCashCollectCommand({ kind: "cash_collect", order_id: "o1", amount_cents: 1 }), null);
  assert.equal(parseCashCollectCommand({ kind: "cash_collect", order_id: ORDER, amount_cents: 0 }), null);
});

test("a fresh replay reserves, runs the cash tender under the same key, then stamps applied", async () => {
  const calls: string[] = [];
  let tenderInput: Record<string, unknown> | null = null;
  const result = await replayCashOutboxItem(
    admin((fn, args) => {
      calls.push(fn);
      if (fn === "pos_outbox_apply") {
        assert.deepEqual(args.p_command, { kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 });
        assert.equal(args.p_operation_key, "pos-till:o1:1:cash:1400");
        return { ok: true, already: false, id: "ob1", stage: "reserved", order_id: ORDER, amount_cents: 1400 };
      }
      if (fn === "pos_outbox_settle") {
        assert.equal(args.p_id, "ob1");
        return { ok: true, already: false, id: "ob1", transaction_id: "txn1" };
      }
      throw new Error(`unexpected rpc ${fn}`);
    }),
    {
      tenantId: "t1",
      deviceId: "d1",
      actorUserId: "u1",
      operationKey: "pos-till:o1:1:cash:1400",
      command: { kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 },
    },
    {
      collect: async (_admin, input) => {
        calls.push("startCollection");
        tenderInput = input as unknown as Record<string, unknown>;
        const ok: StartCollectionResult = {
          ok: true,
          method: "cash",
          orderId: ORDER,
          transactionId: "txn1",
          alreadySettled: false,
          amountCents: 1400,
          tenderedCents: 1400,
          changeCents: 0,
          outstandingAfterCents: 0,
        };
        return ok;
      },
    },
  );
  assert.deepEqual(calls, ["pos_outbox_apply", "startCollection", "pos_outbox_settle"]);
  assert.ok(tenderInput);
  const tender = tenderInput as unknown as Record<string, unknown>;
  assert.equal(tender.method, "cash");
  assert.equal(tender.idempotencyKey, "pos-till:o1:1:cash:1400");
  assert.equal(tender.orderId, ORDER);
  assert.equal(tender.amountCents, 1400);
  assert.equal(tender.actorUserId, "u1");
  assert.deepEqual(result, { ok: true, outboxId: "ob1", orderId: ORDER, transactionId: "txn1", already: false });
});

test("a tender refusal is surfaced and the outbox is NOT stamped", async () => {
  const calls: string[] = [];
  const result = await replayCashOutboxItem(
    admin((fn) => {
      calls.push(fn);
      if (fn === "pos_outbox_apply") {
        return { ok: true, already: true, id: "ob1", stage: "reserved", order_id: ORDER, amount_cents: 1400 };
      }
      throw new Error(`unexpected rpc ${fn}`);
    }),
    {
      tenantId: "t1",
      deviceId: "d1",
      actorUserId: "u1",
      operationKey: "pos-till:o1:1:cash:1400",
      command: { kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 },
    },
    { collect: async () => ({ ok: false, reason: "not_draft", error: "closed" }) },
  );
  assert.deepEqual(calls, ["pos_outbox_apply"]);
  assert.deepEqual(result, { ok: false, reason: "not_open" });
});

test("a key whose cash already landed is not tendered again", async () => {
  const calls: string[] = [];
  const result = await replayCashOutboxItem(
    admin((fn) => {
      calls.push(fn);
      return { ok: true, already: true, id: "ob1", stage: "settled", order_id: ORDER, amount_cents: 1400 };
    }),
    {
      tenantId: "t1",
      deviceId: "d1",
      actorUserId: "u1",
      operationKey: "pos-till:o1:1:cash:1400",
      command: { kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 },
    },
    {
      collect: async () => {
        throw new Error("must not tender a settled key");
      },
    },
  );
  assert.deepEqual(calls, ["pos_outbox_apply"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.already, true);
});

test("the RPC's refusals pass through and the legacy shape never reaches the RPC", async () => {
  const refused = await replayCashOutboxItem(
    admin(() => ({ ok: false, reason: "not_replayable" })),
    {
      tenantId: "t1",
      deviceId: "d1",
      actorUserId: "u1",
      operationKey: "pos-till:o1:1:cash:1400",
      command: { kind: "cash_collect", method: "cash", order_id: ORDER, amount_cents: 1400 },
    },
  );
  assert.deepEqual(refused, { ok: false, reason: "not_replayable" });

  const legacy = await replayCashOutboxItem(
    admin(() => {
      throw new Error("legacy shape must be refused before the socket");
    }),
    {
      tenantId: "t1",
      deviceId: "d1",
      actorUserId: "u1",
      operationKey: "pos-till:o1:1:cash:1400",
      command: { kind: "cash_collect", orderId: ORDER, amountCents: 1400 },
    },
  );
  assert.deepEqual(legacy, { ok: false, reason: "invalid" });
});
