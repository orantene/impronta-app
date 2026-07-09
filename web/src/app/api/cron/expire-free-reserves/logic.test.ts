import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isFreeReserveExpired } from "./logic";

const NOW = Date.parse("2026-07-20T12:00:00.000Z");

describe("isFreeReserveExpired", () => {
  it("returns false when expiresDays is null/0/negative (opted out)", () => {
    const old = "2026-01-01T00:00:00.000Z";
    assert.equal(isFreeReserveExpired(old, null, NOW), false);
    assert.equal(isFreeReserveExpired(old, 0, NOW), false);
    assert.equal(isFreeReserveExpired(old, -3, NOW), false);
  });

  it("returns false when the hold window has not elapsed", () => {
    // Created 2 days ago, 7-day hold → still active.
    const created = new Date(NOW - 2 * 86_400_000).toISOString();
    assert.equal(isFreeReserveExpired(created, 7, NOW), false);
  });

  it("returns true exactly at and past the window", () => {
    const atEdge = new Date(NOW - 7 * 86_400_000).toISOString(); // exactly 7 days
    assert.equal(isFreeReserveExpired(atEdge, 7, NOW), true);
    const past = new Date(NOW - 10 * 86_400_000).toISOString();
    assert.equal(isFreeReserveExpired(past, 7, NOW), true);
  });

  it("is robust to bad timestamps", () => {
    assert.equal(isFreeReserveExpired(undefined, 7, NOW), false);
    assert.equal(isFreeReserveExpired("not-a-date", 7, NOW), false);
  });
});
