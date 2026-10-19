import { test } from "node:test";
import assert from "node:assert/strict";
import { profileLeftCount } from "./profile-left-count";

test("uses the required website slices so Today and More agree", () => {
  const slices = [
    { required: true, done: true },
    { required: true, done: false },
    { required: false, done: false },
  ];
  assert.equal(profileLeftCount({ slices, percent: 60, completionMissing: 8 }), 1);
});

test("falls back to profile completion while the checklist is unknown", () => {
  assert.equal(profileLeftCount({ slices: [], percent: null, completionMissing: 8 }), 8);
  assert.equal(profileLeftCount({ slices: [], percent: null, completionMissing: null }), null);
});
