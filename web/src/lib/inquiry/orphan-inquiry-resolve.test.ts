import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrphanTalent } from "./orphan-inquiry-resolve";

test("a lineup of exactly one talent resolves, and says how", () => {
  const r = resolveOrphanTalent({ interpreted_query: { talent: { selected_ids: ["t1"] } }, source_page: "/t/TAL-00035" });
  assert.deepEqual(r, { ok: true, talentId: "t1", profileCode: "TAL-00035", how: "interpreted_query.talent.selected_ids + source_page" });
});

test("the profile code alone (no lineup) resolves", () => {
  const r = resolveOrphanTalent({ interpreted_query: { source_context: { public_profile_code: "tal-93104" } }, source_page: null });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.profileCode, "TAL-93104");
});

test("several talents on the lineup are ambiguous and skipped", () => {
  const r = resolveOrphanTalent({ interpreted_query: { talent: { selected_ids: ["a", "b"] } } });
  assert.equal(r.ok, false);
});

test("a /t/<code> page that disagrees with the context code is ambiguous", () => {
  const r = resolveOrphanTalent({ interpreted_query: { source_context: { public_profile_code: "TAL-00035" } }, source_page: "/t/TAL-00045" });
  assert.equal(r.ok, false);
});

test("nothing to go on is skipped with a reason, never guessed", () => {
  for (const row of [{}, { interpreted_query: { talent: { selected_ids: [] } }, source_page: "/directory" }, { source_page: "/" }]) {
    const r = resolveOrphanTalent(row);
    assert.equal(r.ok, false);
  }
});

test("the directory page is not a profile page", () => {
  assert.equal(resolveOrphanTalent({ source_page: "/directory" }).ok, false);
});
