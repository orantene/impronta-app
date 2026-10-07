import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { wallClockIn, readAgendaNowFromSearch } from "./agenda-now";

describe("readAgendaNowFromSearch", () => {
  it("returns fallback without param", () => {
    const fallback = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(readAgendaNowFromSearch("", fallback).toISOString(), fallback.toISOString());
  });
  it("parses agendaNow", () => {
    const d = readAgendaNowFromSearch("?agendaNow=2026-09-24T09:50:00.000Z", new Date(0));
    assert.equal(d.toISOString(), "2026-09-24T09:50:00.000Z");
  });
});

describe("wallClockIn", () => {
  it("04:47Z in America/Cancun is Tue Oct 6 at 23:47", () => {
    const w = wallClockIn(new Date("2026-10-07T04:47:00.000Z"), "America/Cancun");
    assert.equal(`${w.getFullYear()}-${w.getMonth() + 1}-${w.getDate()}`, "2026-10-6");
    assert.equal(w.getDay(), 2);
    assert.equal(w.getHours() * 60 + w.getMinutes(), 23 * 60 + 47);
  });
  it("falls back to now for a missing or invalid zone", () => {
    const n = new Date("2026-10-07T04:47:00.000Z");
    assert.equal(wallClockIn(n, null), n);
    assert.equal(wallClockIn(n, "Not/AZone"), n);
  });
});
