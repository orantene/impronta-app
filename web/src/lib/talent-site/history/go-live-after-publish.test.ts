import test from "node:test";
import assert from "node:assert/strict";

import { summarizeGoLive } from "./draft-diff";

const labels = { header: "Header", colours: "Colours" };
const input = {
  shell: { draft: [], live: [] },
  pages: [],
  tokens: { draft: { "color.accent": "x1" }, live: { "color.accent": "x0" } },
};

test("F134: draft tokens Publish cannot carry live are not an unpublished change", () => {
  const s = summarizeGoLive(input, labels, "en", true, false);
  assert.equal(s.unpublishedCount, 0);
});

test("F134: with the theme gallery on, a token difference still counts", () => {
  const s = summarizeGoLive(input, labels, "en", true, true);
  assert.equal(s.unpublishedCount, 1);
});
