import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  FAVORITE_IDS_KEY,
  parseIdList,
  sameIdList,
  SAVED_IDS_KEY,
  subscribeDiscoveryState,
  writeAndBroadcast,
  type DiscoverySnapshot,
} from "./discovery-state-sync";

/**
 * Minimal window/localStorage stand-ins — the node runner has no DOM and the
 * module only touches localStorage + add/removeEventListener + CustomEvent.
 */
function installFakeWindow() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const fake = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    addEventListener: (type: string, cb: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: (e: unknown) => void) => {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent: (event: { type: string }) => {
      listeners.get(event.type)?.forEach((cb) => cb(event));
      return true;
    },
  };
  (globalThis as unknown as { window: unknown }).window = fake;
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  return { store, listeners };
}

beforeEach(() => {
  installFakeWindow();
});

test("a write reaches the sibling provider tree — the modal fork bug", () => {
  // The directory's provider subscribes; the modal's provider writes.
  const seen: DiscoverySnapshot[] = [];
  subscribeDiscoveryState((s) => seen.push(s));

  writeAndBroadcast(SAVED_IDS_KEY, ["talent-a"]);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].key, SAVED_IDS_KEY);
  assert.deepEqual(seen[0].ids, ["talent-a"]);
});

test("REMOVAL propagates — the case a union merge could never express", () => {
  const seen: DiscoverySnapshot[] = [];
  writeAndBroadcast(SAVED_IDS_KEY, ["a", "b"]);
  subscribeDiscoveryState((s) => seen.push(s));

  writeAndBroadcast(SAVED_IDS_KEY, ["a"]); // removed "b" inside the modal

  assert.deepEqual(seen.at(-1)?.ids, ["a"]);
});

test("saved and favorites are independent channels", () => {
  const seen: DiscoverySnapshot[] = [];
  subscribeDiscoveryState((s) => seen.push(s));

  writeAndBroadcast(FAVORITE_IDS_KEY, ["fav-1"]);

  assert.equal(seen.at(-1)?.key, FAVORITE_IDS_KEY);
  assert.deepEqual(seen.at(-1)?.ids, ["fav-1"]);
});

test("writes persist under the pre-existing storage keys", () => {
  const { store } = installFakeWindow();
  writeAndBroadcast(SAVED_IDS_KEY, ["x"]);
  // Changing these key strings would orphan every live visitor's lineup.
  assert.equal(store.get("impronta.public.saved-ids"), JSON.stringify(["x"]));
  assert.equal(FAVORITE_IDS_KEY, "impronta.public.favorite-ids");
});

test("duplicates are normalized away before broadcast", () => {
  const seen: DiscoverySnapshot[] = [];
  subscribeDiscoveryState((s) => seen.push(s));
  const returned = writeAndBroadcast(SAVED_IDS_KEY, ["a", "a", "b"]);
  assert.deepEqual(returned, ["a", "b"]);
  assert.deepEqual(seen.at(-1)?.ids, ["a", "b"]);
});

test("unsubscribe stops delivery", () => {
  const seen: DiscoverySnapshot[] = [];
  const off = subscribeDiscoveryState((s) => seen.push(s));
  off();
  writeAndBroadcast(SAVED_IDS_KEY, ["a"]);
  assert.equal(seen.length, 0);
});

test("blocked storage still broadcasts in-document", () => {
  installFakeWindow();
  (globalThis as unknown as { window: { localStorage: unknown } }).window.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  const seen: DiscoverySnapshot[] = [];
  subscribeDiscoveryState((s) => seen.push(s));
  assert.doesNotThrow(() => writeAndBroadcast(SAVED_IDS_KEY, ["a"]));
  assert.deepEqual(seen.at(-1)?.ids, ["a"]);
});

test("parseIdList tolerates corruption instead of crashing the directory", () => {
  assert.deepEqual(parseIdList(null), []);
  assert.deepEqual(parseIdList("{not json"), []);
  assert.deepEqual(parseIdList('{"a":1}'), []);
  assert.deepEqual(parseIdList('["a",2,"b"]'), ["a", "b"]);
});

test("sameIdList is order-sensitive", () => {
  assert.equal(sameIdList(["a", "b"], ["a", "b"]), true);
  assert.equal(sameIdList(["a", "b"], ["b", "a"]), false);
  assert.equal(sameIdList(["a"], ["a", "b"]), false);
});
