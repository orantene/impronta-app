import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pastDueGraceBody } from "./past-due-grace-copy";

describe("pastDueGraceBody plurals", () => {
  it("en: 0 / 1 / 7 days", () => {
    assert.ok(pastDueGraceBody("en", 0).includes("0 more days."));
    assert.ok(pastDueGraceBody("en", 1).includes("1 more day."));
    assert.ok(pastDueGraceBody("en", 7).includes("7 more days."));
  });
  it("es: 0 / 1 / 7 days", () => {
    assert.ok(pastDueGraceBody("es", 0).includes("0 días más"));
    assert.ok(pastDueGraceBody("es", 1).includes("1 día más"));
    assert.ok(pastDueGraceBody("es", 7).includes("7 días más"));
  });
  it("never leaks the (s) hack or a raw key or placeholder", () => {
    for (const l of ["en", "es"]) {
      for (const n of [0, 1, 7]) {
        const s = pastDueGraceBody(l, n);
        assert.doesNotMatch(s, /\(s\)|\{|admin\.account/);
      }
    }
  });
});
