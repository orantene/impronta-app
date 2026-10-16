import assert from "node:assert/strict";
import { test } from "node:test";

import { DIRECTORY_SCOPE, addToScope, idsInScope, inScope, removeFromScope, scopeKeyForPath } from "./cart-scope";

test("talent pages and the directory are different contexts", () => {
  assert.equal(scopeKeyForPath("/t/TAL-93128"), "t:TAL-93128");
  assert.equal(scopeKeyForPath("/es/t/TAL-93940"), "t:TAL-93940");
  assert.equal(scopeKeyForPath("/directory"), DIRECTORY_SCOPE);
  assert.equal(scopeKeyForPath(null), DIRECTORY_SCOPE);
});

test("an entry added on the directory never shows in a talent page's inquiry (#11)", () => {
  const eli = addToScope({}, "eli", DIRECTORY_SCOPE);
  assert.equal(inScope(eli, "eli", DIRECTORY_SCOPE), true);
  assert.equal(inScope(eli, "eli", "t:TAL-93128"), false);
  assert.deepEqual(idsInScope(["eli", "adrian"], addToScope(eli, "adrian", "t:TAL-93128"), "t:TAL-93128"), ["adrian"]);
});

test("entries with no record are directory entries", () => {
  assert.equal(inScope({}, "old", DIRECTORY_SCOPE), true);
  assert.equal(inScope({}, "old", "t:X"), false);
});

test("the same talent can sit in two contexts and only leaves the server with the last", () => {
  const both = addToScope(addToScope({}, "a", DIRECTORY_SCOPE), "a", "t:X");
  const first = removeFromScope(both, "a", "t:X");
  assert.equal(first.lastScope, false);
  assert.equal(inScope(first.map, "a", DIRECTORY_SCOPE), true);
  assert.equal(removeFromScope(first.map, "a", DIRECTORY_SCOPE).lastScope, true);
});
