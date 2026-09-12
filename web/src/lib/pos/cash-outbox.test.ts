import assert from "node:assert/strict";
import { test } from "node:test";

import {
  POS_CASH_OUTBOX_KEY,
  confirmCashOrEnqueue,
  enqueueCashCollect,
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
  assert.equal(rows[0]?.command.orderId, "o1");
  assert.equal(confirmCashOrEnqueue({
    online: true,
    orderId: "o1",
    amountCents: 1400,
    operationKey: "pos-till:o1:2:cash:1400",
  }), "online");
  assert.equal(store.getItem(POS_CASH_OUTBOX_KEY) !== null, true);
  enqueueCashCollect({
    operationKey: "other",
    command: { kind: "cash_collect", amountCents: 100, orderId: "o2" },
  });
  assert.equal(readCashOutbox().length, 2);
  g.window = prev;
});
