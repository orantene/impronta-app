import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSuggestionPatch, toMinor } from "./suggestion-input";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const id = "123e4567-e89b-12d3-a456-426614174000";

describe("parseSuggestionPatch", () => {
  it("accepts a good edit", () => {
    const r = parseSuggestionPatch(fd({ id, amount: "35,5", duration: "45", status: "approved" }));
    assert.ok(r.ok && r.patch.amountMajor === 35.5 && r.patch.durationMinutes === 45);
    assert.equal(toMinor(35.5), 3550);
  });
  it("rejects bad id, price, minutes, status", () => {
    assert.equal(parseSuggestionPatch(fd({ id: "x", amount: "1", status: "draft" })).ok, false);
    assert.equal(parseSuggestionPatch(fd({ id, amount: "0", status: "draft" })).ok, false);
    assert.equal(parseSuggestionPatch(fd({ id, amount: "5", duration: "2", status: "draft" })).ok, false);
    assert.equal(parseSuggestionPatch(fd({ id, amount: "5", status: "live" })).ok, false);
  });
  it("blank minutes is null", () => {
    const r = parseSuggestionPatch(fd({ id, amount: "5", duration: "", status: "draft" }));
    assert.ok(r.ok && r.patch.durationMinutes === null);
  });
});
