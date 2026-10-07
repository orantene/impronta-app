import assert from "node:assert/strict";
import test from "node:test";

import { pickSelectedAfterRefresh } from "./booking-targets";

test("empty list then a person added selects the new person", () => {
  assert.equal(pickSelectedAfterRefresh(null, [{ id: "p1" }]), "p1");
});

test("a still-valid selection is kept across a refresh", () => {
  assert.equal(pickSelectedAfterRefresh("p2", [{ id: "p1" }, { id: "p2" }]), "p2");
});

test("a removed selection falls back to the first target", () => {
  assert.equal(pickSelectedAfterRefresh("gone", [{ id: "p1" }]), "p1");
});
