import assert from "node:assert/strict";
import { test } from "node:test";

import {
  writeOfferSnapshot,
  readOfferSnapshot,
  clearOfferSnapshot,
  snapshotAgeLabel,
} from "./offer-local-snapshot";

function memStorage() {
  const m = new Map<string, string>();
  return {
    store: m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test("write then read round-trips the editor state", () => {
  const s = memStorage();
  writeOfferSnapshot("off-1", { total: 5000, lineCount: 3, data: { lines: [1, 2, 3] } }, { storage: s, nowMs: 1000 });
  const got = readOfferSnapshot("off-1", { storage: s, nowMs: 2000 });
  assert.ok(got);
  assert.equal(got!.total, 5000);
  assert.equal(got!.lineCount, 3);
  assert.deepEqual(got!.data, { lines: [1, 2, 3] });
});

test("read returns null for a different offerId", () => {
  const s = memStorage();
  writeOfferSnapshot("off-1", { total: 1, lineCount: 1, data: null }, { storage: s });
  assert.equal(readOfferSnapshot("off-2", { storage: s }), null);
});

test("read rejects a stale (>24h) snapshot", () => {
  const s = memStorage();
  writeOfferSnapshot("off-1", { total: 1, lineCount: 1, data: null }, { storage: s, nowMs: 0 });
  const day = 24 * 60 * 60 * 1000;
  assert.ok(readOfferSnapshot("off-1", { storage: s, nowMs: day - 1 })); // within window
  assert.equal(readOfferSnapshot("off-1", { storage: s, nowMs: day + 1 }), null); // stale
});

test("read tolerates garbage without throwing", () => {
  const s = memStorage();
  s.store.set("tulala.offerDraft.off-x", "{not json");
  assert.equal(readOfferSnapshot("off-x", { storage: s }), null);
});

test("clear removes the snapshot", () => {
  const s = memStorage();
  writeOfferSnapshot("off-1", { total: 1, lineCount: 1, data: null }, { storage: s });
  clearOfferSnapshot("off-1", { storage: s });
  assert.equal(readOfferSnapshot("off-1", { storage: s }), null);
});

test("snapshotAgeLabel is coarse + locale-aware", () => {
  assert.equal(snapshotAgeLabel(1000, 1000 + 30_000, "en"), "just now");
  assert.equal(snapshotAgeLabel(1000, 1000 + 4 * 60_000, "es"), "hace 4 min");
  assert.equal(snapshotAgeLabel(1000, 1000 + 2 * 3_600_000, "en"), "2h ago");
});
