import assert from "node:assert/strict";
import { test } from "node:test";
import { firstNameOf, splitGuestFullName } from "./mini-chat-styles";

test("splitGuestFullName treats a spaced dash as a separator (TUL-721)", () => {
  assert.deepEqual(splitGuestFullName("QA Fixture — Max Talent"), {
    firstName: "QA Fixture",
    lastName: "Max Talent",
  });
  assert.deepEqual(splitGuestFullName("QA Fixture - Max Talent"), {
    firstName: "QA Fixture",
    lastName: "Max Talent",
  });
});

test("splitGuestFullName keeps plain names and drops dangling dashes", () => {
  assert.deepEqual(splitGuestFullName("Maya Lopez"), { firstName: "Maya", lastName: "Lopez" });
  assert.deepEqual(splitGuestFullName("Maya —"), { firstName: "Maya", lastName: "" });
  assert.deepEqual(splitGuestFullName("Ana-Sofia Lopez"), { firstName: "Ana-Sofia", lastName: "Lopez" });
});

test("firstNameOf never returns a dash", () => {
  assert.equal(firstNameOf("QA Fixture — Max Talent"), "QA");
  assert.equal(firstNameOf("Maya Lopez"), "Maya");
});
