import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RECORD_SLOW_AFTER_MS, readRecordInParallel, recordViewState } from "./booking-record-state";

const base = { bookingId: "b1", mounted: true, hasItem: false, settled: false, slow: false };

describe("recordViewState", () => {
  it("server render (no id, not mounted) is loading, never the failure state", () => {
    assert.equal(recordViewState({ ...base, bookingId: "", mounted: false }), "loading");
  });
  it("mounted with no id at all is unavailable", () => {
    assert.equal(recordViewState({ ...base, bookingId: "", mounted: true }), "unavailable");
  });
  it("a read still in flight stays loading, even past the old 8 s", () => {
    assert.ok(RECORD_SLOW_AFTER_MS > 8000);
    assert.equal(recordViewState({ ...base }), "loading");
    assert.equal(recordViewState({ ...base, slow: true }), "still-loading");
  });
  it("unavailable only after the reads settled with nothing", () => {
    assert.equal(recordViewState({ ...base, settled: true }), "unavailable");
  });
  it("a late result replaces the still-loading state", () => {
    assert.equal(recordViewState({ ...base, slow: true, hasItem: true, settled: true }), "ready");
  });
});

describe("readRecordInParallel", () => {
  it("one read throwing does not drop the other", async () => {
    const a = await readRecordInParallel(
      async () => {
        throw new Error("item down");
      },
      async () => ({ clientName: "Ana", status: "cancelled" }),
    );
    assert.deepEqual(a, { item: null, stub: { clientName: "Ana", status: "cancelled" } });
    const b = await readRecordInParallel(
      async () => ({ id: "x" }),
      async () => {
        throw new Error("stub down");
      },
    );
    assert.deepEqual(b, { item: { id: "x" }, stub: null });
  });
  it("starts both reads before either finishes", async () => {
    const order: string[] = [];
    await readRecordInParallel(
      async () => {
        order.push("item-start");
        await new Promise((r) => setTimeout(r, 5));
        order.push("item-end");
        return null;
      },
      async () => {
        order.push("stub-start");
        return null;
      },
    );
    assert.deepEqual(order.slice(0, 2), ["item-start", "stub-start"]);
  });
});
