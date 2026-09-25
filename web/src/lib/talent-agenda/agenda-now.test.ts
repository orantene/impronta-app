import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readAgendaNowFromSearch } from "./agenda-now";

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
