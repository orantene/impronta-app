/**
 * F29: a real (non-fixture) talent's drawer never opens with the demo
 * profile's data. The drawer saves every section on save, so demo languages
 * ("Spanish · English · Italian · French"), emergency contact and rate
 * visibility used to be written into real profiles.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { makeInitialProfileState } from "./profile-state";

const REAL_ID = "b4620ed3-bc01-41d4-aa75-3965f4d3efe0";

test("a real talent opens with no invented languages, contact or videos", () => {
  const s = makeInitialProfileState({ mode: "edit-self", talentId: REAL_ID } as never, true, null);
  assert.deepEqual(s.languages, []);
  assert.deepEqual(s.emergencyContact, { name: "", relation: "", phone: "" });
  assert.equal(s.videoLinks.length, 0);
  assert.notEqual(s.stageName, "Marta Reyes");
});

test("seeded languages still hydrate", () => {
  const s = makeInitialProfileState(
    { mode: "edit-self", talentId: REAL_ID, seed: { languages: [{ language: "Spanish", level: "native" }] } } as never,
    true,
    null,
  );
  assert.deepEqual(s.languages, [{ language: "Spanish", level: "native" }]);
});
