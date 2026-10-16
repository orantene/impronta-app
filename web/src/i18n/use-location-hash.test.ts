import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withLocationHash } from "./use-location-hash";

describe("E3-J8-anchor: withLocationHash", () => {
  it("appends section hash to locale paths", () => {
    assert.equal(withLocationHash("/en", "#services"), "/en#services");
    assert.equal(withLocationHash("/", "#about"), "/#about");
    assert.equal(withLocationHash("/en?x=1", "#services"), "/en?x=1#services");
  });

  it("leaves href alone when hash empty", () => {
    assert.equal(withLocationHash("/en", ""), "/en");
    assert.equal(withLocationHash("/en", "#"), "/en");
  });

  it("replaces an existing hash rather than stacking", () => {
    assert.equal(withLocationHash("/en#old", "#services"), "/en#services");
  });
});
