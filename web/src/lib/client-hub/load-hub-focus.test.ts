import assert from "node:assert/strict";
import { test } from "node:test";
import { hubIsOpen, normaliseFocus, sortByFocus } from "./load-hub-focus";

const items = [
  { id: "a", talentCodes: ["TAL-1"] },
  { id: "b", talentCodes: ["TAL-2", "TAL-9"] },
  { id: "c", talentCodes: [] },
  { id: "d", talentCodes: ["TAL-9"] },
];

test("focus moves matches first, keeps relative order", () => {
  assert.deepEqual(sortByFocus(items, "TAL-9").map((i) => i.id), ["b", "d", "a", "c"]);
});

test("no focus leaves order unchanged", () => {
  assert.deepEqual(sortByFocus(items, undefined).map((i) => i.id), ["a", "b", "c", "d"]);
  assert.deepEqual(sortByFocus(items, "  ").map((i) => i.id), ["a", "b", "c", "d"]);
});

test("focus is trimmed and case-insensitive", () => {
  assert.equal(normaliseFocus(" tal-9 "), "TAL-9");
  assert.deepEqual(sortByFocus(items, " tal-9 ").map((i) => i.id), ["b", "d", "a", "c"]);
});

test("hubIsOpen = flag || paid", () => {
  assert.equal(hubIsOpen(false, "standard"), false);
  assert.equal(hubIsOpen(false, "pro"), true);
  assert.equal(hubIsOpen(false, "enterprise"), true);
  assert.equal(hubIsOpen(true, "standard"), true);
  assert.equal(hubIsOpen(true, undefined), true);
});
