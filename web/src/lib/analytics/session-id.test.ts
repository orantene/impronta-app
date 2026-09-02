import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, test } from "node:test";

/**
 * The bug this guards against is not a crash. It is a field the receiver
 * accepts and the sender never populates: every analytics row ever written
 * carried a null session_id, the API validated `session_id` the whole time,
 * and no test failed because nothing was broken, only unmeasured.
 */

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

function setup(storage: unknown = new MemoryStorage()) {
  (globalThis as Record<string, unknown>).window = {};
  (globalThis as Record<string, unknown>).sessionStorage = storage;
}

async function fresh() {
  return (await import(`./session-id?${Math.random()}`)) as typeof import("./session-id");
}

describe("analytics session id", () => {
  beforeEach(() => {
    for (const k of ["window", "sessionStorage"]) {
      delete (globalThis as Record<string, unknown>)[k];
    }
  });

  test("is stable across calls within a visit", async () => {
    setup();
    const { getSessionId } = await fresh();
    const a = getSessionId();
    assert.ok(a, "expected an id");
    assert.equal(getSessionId(), a, "a funnel cannot stitch if the id changes mid visit");
  });

  test("two visits get different ids", async () => {
    setup(new MemoryStorage());
    const first = (await fresh()).getSessionId();
    setup(new MemoryStorage()); // new tab, fresh sessionStorage
    const second = (await fresh()).getSessionId();
    assert.notEqual(first, second);
  });

  test("blocked storage returns null instead of throwing", async () => {
    setup({
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    });
    const { getSessionId } = await fresh();
    let id: string | null = "unset";
    assert.doesNotThrow(() => { id = getSessionId(); });
    assert.equal(id, null, "unstitched is acceptable; a thrown error on a marketing page is not");
  });

  test("returns null on the server", async () => {
    const { getSessionId } = await fresh();
    assert.equal(getSessionId(), null);
  });
});

/**
 * The contract check. The receiver accepting a field the sender never
 * populates is the exact shape of the original bug, so it is pinned rather
 * than left to review.
 */
test("the client actually sends session_id to the events route", () => {
  const client = readFileSync("src/lib/analytics/track-client.ts", "utf8");
  assert.match(
    client,
    /session_id:\s*sessionId/,
    "track-client must send session_id, or every event is unjoinable again.",
  );

  const route = readFileSync("src/app/api/analytics/events/route.ts", "utf8");
  assert.match(
    route,
    /session_id/,
    "The events route must still accept session_id for the client to be worth sending it.",
  );
});
