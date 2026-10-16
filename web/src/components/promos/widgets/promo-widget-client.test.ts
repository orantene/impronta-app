import assert from "node:assert/strict";
import { test } from "node:test";

import { popupCap, readViewer, safeGet, safeSet, type StorageLike } from "./promo-widget-client";

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const throwing: StorageLike = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

test("storage that throws never throws out of the helpers", () => {
  assert.equal(safeGet(throwing, "k"), null);
  assert.equal(safeSet(throwing, "k", "v"), false);
  assert.equal(safeGet(null, "k"), null);
  assert.equal(safeSet(null, "k", "v"), false);
  assert.deepEqual(readViewer({ local: throwing, session: throwing }, null), { returning: false, signedIn: false });
});

test("first look is new and stays new for the tab; the next visit is returning", () => {
  const local = memory();
  const tab1 = memory();
  assert.deepEqual(readViewer({ local, session: tab1 }, null), { returning: false, signedIn: false });
  // Same tab, re-render or route change: still new.
  assert.deepEqual(readViewer({ local, session: tab1 }, null), { returning: false, signedIn: false });
  // A later visit (new tab session): returning.
  assert.deepEqual(readViewer({ local, session: memory() }, null), { returning: true, signedIn: false });
});

test("signed in only when the site says so", () => {
  const stores = { local: memory(), session: memory() };
  assert.equal(readViewer(stores, true).signedIn, true);
  assert.equal(readViewer(stores, false).signedIn, false);
  assert.equal(readViewer(stores, null).signedIn, false);
});

test("popup cap: once per session uses sessionStorage, daily uses localStorage", () => {
  const local = memory();
  const session = memory();
  const s = popupCap("session", "n1", { local, session });
  assert.equal(s.allowed(1000), true);
  s.record(1000);
  assert.equal(s.allowed(2000), false);
  assert.equal(local.data.size, 0);
  assert.equal(session.data.size, 1);

  const d = popupCap("daily", "n2", { local, session });
  assert.equal(d.allowed(1000), true);
  d.record(1000);
  assert.equal(d.allowed(1000 + 3_600_000), false);
  assert.equal(d.allowed(1000 + 86_400_000), true);
  assert.equal(local.data.size, 1);
});

test("popup cap: always never records; blocked storage means it may show (and cannot remember)", () => {
  const local = memory();
  const a = popupCap("always", "n3", { local, session: null });
  a.record(5);
  assert.equal(local.data.size, 0);
  assert.equal(a.allowed(6), true);
  const blocked = popupCap("once", "n4", { local: throwing, session: throwing });
  assert.equal(blocked.allowed(1), true);
  assert.doesNotThrow(() => blocked.record(1));
});
