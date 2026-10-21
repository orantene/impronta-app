import assert from "node:assert/strict";
import test from "node:test";

import { choicesForEntry, photoChoiceAllowed, type PhotoChoice } from "./entry-photos";

const a: PhotoChoice = { mediaId: "m1", url: "https://x/1.jpg" };
const b: PhotoChoice = { mediaId: "m2", url: "https://x/2.jpg" };

test("an entry's photo choices are its members' own photos, in order, without repeats", () => {
  const by = new Map<string, PhotoChoice[]>([["o1", [a, b]], ["o2", [b]], ["o3", []]]);
  assert.deepEqual(choicesForEntry(["o1", "o2", "o3", "missing"], by), [a, b]);
});

test("choices are capped so a huge group stays a small picker", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ mediaId: `m${i}`, url: `https://x/${i}.jpg` }));
  assert.equal(choicesForEntry(["o"], new Map([["o", many]])).length, 24);
});

test("only one of the entry's own photos can be chosen; clearing is always allowed", () => {
  assert.equal(photoChoiceAllowed([a, b], "m2"), true);
  assert.equal(photoChoiceAllowed([a, b], "other-tenants-media"), false);
  assert.equal(photoChoiceAllowed([], "m1"), false);
  assert.equal(photoChoiceAllowed([a], null), true);
});
