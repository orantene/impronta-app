/**
 * asset-edits.test.ts — the alt/tag rules that survived the move out of the tile.
 *
 * WHAT THIS PROVES, precisely: given a server value and a draft, the module
 * decides correctly whether to save and WHAT to send. It does NOT prove the
 * detail rail is wired to these functions, that the PATCH lands, or that the
 * grid re-renders afterwards — `detail-editing.static.test.ts` pins the wiring
 * by reading the source, and the round trip is browser work.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { altNeedsSave, altPayload, tagsAfterAdd, tagsAfterRemove } from "./asset-edits";

test("[media-edit] alt saves only when it actually differs from the server value", () => {
  assert.equal(altNeedsSave(null, ""), false, "empty over empty is not a save");
  assert.equal(altNeedsSave(null, "   "), false, "whitespace is empty");
  assert.equal(altNeedsSave("Runway shot", "Runway shot"), false);
  assert.equal(altNeedsSave("Runway shot", "  Runway shot  "), false, "trim first");
  assert.equal(altNeedsSave("Runway shot", "Backstage"), true);
  // Clearing an alt IS a save — the operator meant to delete it.
  assert.equal(altNeedsSave("Runway shot", ""), true);
  assert.equal(altPayload("  Backstage  "), "Backstage");
});

test("[media-edit] adding a tag normalizes, refuses duplicates, and never sends a no-op", () => {
  assert.deepEqual(tagsAfterAdd([], "Swimwear"), ["swimwear"]);
  assert.deepEqual(tagsAfterAdd(["editorial"], "  Beach  "), ["editorial", "beach"]);
  assert.equal(tagsAfterAdd(["swimwear"], "SWIMWEAR"), null, "duplicate ⇒ no PATCH");
  assert.equal(tagsAfterAdd(["a"], "   "), null, "empty ⇒ no PATCH");
  // The existing list is never mutated in place — the grid holds the same array.
  const tags = ["editorial"];
  tagsAfterAdd(tags, "beach");
  assert.deepEqual(tags, ["editorial"]);
});

test("[media-edit] removing a tag drops exactly one, and an absent tag is not a save", () => {
  assert.deepEqual(tagsAfterRemove(["a", "b", "c"], "b"), ["a", "c"]);
  assert.deepEqual(tagsAfterRemove(["a"], "a"), []);
  assert.equal(tagsAfterRemove(["a", "b"], "z"), null);
});
