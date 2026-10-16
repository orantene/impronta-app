import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSupersededReport, planSupersede } from "./superseded-rows";

describe("planSupersede", () => {
  it("closes rows at or below the pin and keeps newer ones open", () => {
    const out = planSupersede(5, [
      { id: "a", state: "available", toVersion: 5 },
      { id: "b", state: "previewed", toVersion: 4 },
      { id: "c", state: "available", toVersion: 6 },
    ]);
    assert.deepEqual(out.map((c) => c.id), ["a", "b"]);
  });
  it("closes open rows of a design she switched away from, even with no pin", () => {
    const out = planSupersede(null, [
      { id: "x", state: "available", toVersion: null, otherDesign: true },
      { id: "y", state: "available", toVersion: 9 },
    ]);
    assert.deepEqual(out.map((c) => c.id), ["x"]);
    assert.equal(isSupersededReport(out[0]!.report), true);
  });
  it("never touches already closed rows", () => {
    assert.deepEqual(planSupersede(3, [{ id: "z", state: "applied", toVersion: 1, otherDesign: true }]), []);
  });
});
