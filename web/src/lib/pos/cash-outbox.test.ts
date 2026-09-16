import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POS_CASH_OUTBOX_KEY,
  confirmCashOrEnqueue,
  enqueueCashCollect,
  normalizeCashOutboxItem,
  readCashOutbox,
  writeCashOutbox,
} from "./cash-outbox";

function memoryStorage(): Storage {
  const bag = new Map<string, string>();
  return {
    get length() {
      return bag.size;
    },
    clear() {
      bag.clear();
    },
    getItem(key: string) {
      return bag.get(key) ?? null;
    },
    key(index: number) {
      return [...bag.keys()][index] ?? null;
    },
    removeItem(key: string) {
      bag.delete(key);
    },
    setItem(key: string, value: string) {
      bag.set(key, value);
    },
  } as Storage;
}

test("offline cash confirm enqueues cash_collect and skips a second tap of the same key", () => {
  const store = memoryStorage();
  const g = globalThis as { window?: { localStorage: Storage } };
  const prev = g.window;
  g.window = { localStorage: store };
  writeCashOutbox([]);
  assert.equal(
    confirmCashOrEnqueue({
      online: false,
      orderId: "o1",
      amountCents: 1400,
      operationKey: "pos-till:o1:1:cash:1400",
    }),
    "queued",
  );
  assert.equal(confirmCashOrEnqueue({
    online: false,
    orderId: "o1",
    amountCents: 1400,
    operationKey: "pos-till:o1:1:cash:1400",
  }), "queued");
  const rows = readCashOutbox();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.command.kind, "cash_collect");
  assert.equal(rows[0]?.command.order_id, "o1");
  assert.equal(rows[0]?.command.amount_cents, 1400);
  assert.equal(confirmCashOrEnqueue({
    online: true,
    orderId: "o1",
    amountCents: 1400,
    operationKey: "pos-till:o1:2:cash:1400",
  }), "online");
  assert.equal(store.getItem(POS_CASH_OUTBOX_KEY) !== null, true);
  enqueueCashCollect({
    operationKey: "other",
    command: { kind: "cash_collect", method: "cash", order_id: "o2", amount_cents: 100 },
  });
  assert.equal(readCashOutbox().length, 2);
  g.window = prev;
});

/**
 * THE SHAPE IS THE RPC'S. `pos_outbox_apply` reads `order_id` and
 * `amount_cents` and refuses `invalid` when `order_id` is null. The first cut
 * queued `orderId` / `amountCents`, so no offline cash sale could ever replay
 * (audit A4, 2026-09-15). This pins the queued command to the keys the SQL
 * reads, by reading the SQL.
 */
test("a queued cash_collect carries exactly the keys pos_outbox_apply reads", () => {
  const store = memoryStorage();
  const g = globalThis as { window?: { localStorage: Storage } };
  const prev = g.window;
  g.window = { localStorage: store };
  writeCashOutbox([]);
  confirmCashOrEnqueue({ online: false, orderId: "o-uuid", amountCents: 2500.7, operationKey: "pos-till:o-uuid:1:cash:2500" });
  const raw = JSON.parse(store.getItem(POS_CASH_OUTBOX_KEY) ?? "[]") as Array<{ command: Record<string, unknown> }>;
  const command = raw[0]?.command ?? {};
  assert.deepEqual(Object.keys(command).sort(), ["amount_cents", "kind", "method", "order_id"]);
  assert.equal(command.order_id, "o-uuid");
  assert.equal(command.amount_cents, 2500);
  assert.equal(command.method, "cash");
  assert.equal("orderId" in command, false);
  assert.equal("amountCents" in command, false);

  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231237000_pos_outbox_apply_settles.sql"),
    "utf8",
  );
  for (const key of Object.keys(command)) {
    assert.match(sql, new RegExp(`p_command->>'${key}'`), `pos_outbox_apply never reads '${key}'`);
  }
  g.window = prev;
});

test("legacy camelCase rows are normalised on read; junk is dropped", () => {
  const store = memoryStorage();
  const g = globalThis as { window?: { localStorage: Storage } };
  const prev = g.window;
  g.window = { localStorage: store };
  store.setItem(
    POS_CASH_OUTBOX_KEY,
    JSON.stringify([
      { operationKey: "legacy-key-1", command: { kind: "cash_collect", amountCents: 1400, orderId: "o1" } },
      { operationKey: "card-key-1", command: { kind: "card_collect", provider: "stripe", order_id: "o1", amount_cents: 1 } },
      { operationKey: "zero-key-1", command: { kind: "cash_collect", order_id: "o1", amount_cents: 0 } },
      { operationKey: "good-key-1", command: { kind: "cash_collect", method: "cash", order_id: "o2", amount_cents: 300 } },
    ]),
  );
  const rows = readCashOutbox();
  assert.deepEqual(rows, [
    { operationKey: "legacy-key-1", command: { kind: "cash_collect", method: "cash", order_id: "o1", amount_cents: 1400 } },
    { operationKey: "good-key-1", command: { kind: "cash_collect", method: "cash", order_id: "o2", amount_cents: 300 } },
  ]);
  assert.equal(normalizeCashOutboxItem({ operationKey: "k", command: { kind: "cash_collect", method: "online_card", order_id: "o", amount_cents: 5 } }), null);
  g.window = prev;
});
