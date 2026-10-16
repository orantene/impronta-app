import assert from "node:assert/strict";
import test from "node:test";
import { talentProfileRobots, talentProfileRobotsMeta } from "./talent-profile-robots";

const ok = { isPubliclyListed: true, isPubliclyHidden: false, visibility: "public" };
const NOINDEX = { index: false, follow: false };

test("listed public profile is indexable (no robots override)", () => {
  assert.equal(talentProfileRobots(ok), undefined);
});
test("unlisted profile is noindex", () => {
  assert.deepEqual(talentProfileRobots({ ...ok, isPubliclyListed: false }), NOINDEX);
  assert.deepEqual(talentProfileRobots({ ...ok, isPubliclyListed: null }), NOINDEX);
});
test("hidden profile is noindex", () => {
  assert.deepEqual(talentProfileRobots({ ...ok, isPubliclyHidden: true }), NOINDEX);
});
test("non-public visibility is noindex", () => {
  assert.deepEqual(talentProfileRobots({ ...ok, visibility: "private" }), NOINDEX);
  assert.deepEqual(talentProfileRobots({ ...ok, visibility: null }), NOINDEX);
});
test("draft preview is noindex", () => {
  assert.deepEqual(talentProfileRobots({ ...ok, draftPreview: true }), NOINDEX);
});

test("meta fragment spreads robots only when not indexable", () => {
  assert.deepEqual(
    talentProfileRobotsMeta({ is_publicly_listed: true, is_publicly_hidden: false, visibility: "public" }),
    {},
  );
  assert.deepEqual(talentProfileRobotsMeta({ is_publicly_listed: false }), { robots: NOINDEX });
});
